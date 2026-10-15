import {
  fetchLocation,
  fetchSave,
  fetchStats,
  travelTo,
  type LocationDefinition,
  type PlayerSave,
  type PlayerStats,
} from './api.js';
import type { LocationConfig as GameLocationConfig } from './game/scenes/location-types.js';

export interface TravelActionsDeps {
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave) => void;
  setStats: (s: PlayerStats) => void;
  getLocation: () => GameLocationConfig | null;
  setLocation: (loc: GameLocationConfig) => void;
  toGameLocation: (loc: LocationDefinition) => GameLocationConfig;
  updateHud: (save: PlayerSave, stats?: PlayerStats) => void;
  showToast: (text: string) => void;
  transitionLocation: () => void;
  syncUiBlocked: () => void;
  travelEl: HTMLElement;
  onTravelResult?: (ok: boolean) => void;
  /** Hint WS target map + freeze pose sync until the new scene connects. */
  notifyRealtimeTravel?: (locationId: string) => void;
}

const destCache = new Map<string, LocationDefinition>();
const TRAVEL_HTTP_MS = 10_000;
const TRAVEL_TIMEOUT = 'Не удалось подтвердить переход — проверьте соединение';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string, abort: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { abort(); reject(new Error(message)); }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function clientCanTravel(
  save: PlayerSave,
  loc: LocationDefinition,
): { ok: true } | { ok: false; reason: string } {
  if (save.location === loc.id) {
    return { ok: false, reason: 'Вы уже здесь' };
  }
  if (loc.privateOwnerOnly && !save.housing) {
    return { ok: false, reason: 'Сначала купи квартиру у дворецкого в Гавани' };
  }
  const flags = loc.requires?.anyFlag ?? [];
  if (flags.length > 0 && !flags.some((f) => Boolean(save.questFlags?.[f]))) {
    return {
      ok: false,
      reason: loc.requires?.denyMessage ?? 'Путь ещё закрыт — сначала выполни связанный квест',
    };
  }
  return { ok: true };
}

export function createTravelActions(deps: TravelActionsDeps) {
  let travelBusy = false;
  let travelSeq = 0;
  let lastDenyToastAt = 0;
  let lastDenyKey = '';

  function toastDenied(reason: string, key: string): void {
    const now = Date.now();
    if (key === lastDenyKey && now - lastDenyToastAt < 8000) return;
    lastDenyKey = key;
    lastDenyToastAt = now;
    deps.showToast(reason);
  }

  async function resolveDest(locationId: string, signal: AbortSignal): Promise<LocationDefinition | null> {
    try {
      const loc = await fetchLocation(locationId, signal);
      if (!signal.aborted) destCache.set(locationId, loc);
      return loc;
    } catch (err) {
      if (signal.aborted) throw err;
      return destCache.get(locationId) ?? null;
    }
  }

  async function doTravel(locationId: string): Promise<void> {
    const save = deps.getSave();
    if (!save) { deps.onTravelResult?.(false); return; }
    if (travelBusy) { deps.showToast('Переход уже выполняется…'); return; }
    if (save.location === locationId || deps.getLocation()?.id === locationId) {
      deps.onTravelResult?.(false); return;
    }

    travelBusy = true;
    const seq = ++travelSeq;
    const originLocation = deps.getLocation();
    const current = (): boolean => seq === travelSeq && deps.getSave()?.id === save.id && deps.getSave()?.location === save.location && deps.getLocation() === originLocation;
    const request = new AbortController();
    function apply(result: Awaited<ReturnType<typeof travelTo>>): void {
      deps.setSave(result.save);
      deps.setStats(result.stats);
      deps.setLocation(deps.toGameLocation(result.location));
      destCache.set(result.location.id, result.location);
      deps.updateHud(result.save, result.stats);
      deps.travelEl.classList.remove('visible');
      deps.notifyRealtimeTravel?.(result.location.id);
      deps.transitionLocation();
      deps.syncUiBlocked();
      deps.onTravelResult?.(true);
    }
    try {
      const result = await withTimeout((async () => {
        const dest = await resolveDest(locationId, request.signal);
        if (request.signal.aborted || !current()) return null;
        if (dest) {
          const gate = clientCanTravel(save, dest);
          if (!gate.ok) throw new Error(gate.reason);
        }
        return travelTo(save.id, locationId, request.signal);
      })(), TRAVEL_HTTP_MS, TRAVEL_TIMEOUT, () => request.abort());
      if (!result || !current()) return;
      if ((deps.getSave()?.revision ?? 0) > (result.save.revision ?? 0)) throw new Error('Состояние персонажа обновилось — переход проверен повторно');
      apply(result);
      deps.showToast(`Прибыл: ${result.location.name}`);
    } catch (err) {
      request.abort();
      if (!current()) return;
      // The server may have committed travel before its HTTP response was lost.
      // Read the authoritative map before allowing another travel command.
      const recovery = new AbortController();
      try {
        const recovered = await withTimeout((async () => {
          const fresh = await fetchSave(save.id, recovery.signal);
          if (recovery.signal.aborted || !current() || fresh.location === save.location) return null;
          const [loc, stats] = await Promise.all([fetchLocation(fresh.location, recovery.signal), fetchStats(fresh.id, recovery.signal)]);
          if (recovery.signal.aborted) return null;
          return { save: fresh, location: loc, stats };
        })(), 5000, TRAVEL_TIMEOUT, () => recovery.abort());
        if (!current()) return;
        if (recovered) { apply(recovered); deps.showToast(`Прибыл: ${recovered.location.name}`); return; }
      } catch { /* Report the original error if reconciliation is unavailable. */ }
      finally { recovery.abort(); }
      if (!current()) return;
      const msg = err instanceof Error ? err.message : 'Не удалось путешествовать';
      toastDenied(msg, `err:${locationId}:${msg}`);
      deps.onTravelResult?.(false);
    } finally {
      request.abort();
      if (seq === travelSeq) travelBusy = false;
    }
  }

  return { doTravel };
}
