import {
  fetchSave,
  fetchLocation,
  fetchStats,
  respawnSave,
  type LocationDefinition,
  type PlayerSave,
  type PlayerStats,
} from './api.js';
import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import type { LocationConfig as GameLocationConfig } from './game/scenes/location-types.js';
import { resetDeathScreen } from './death-ui.js';

export interface RespawnActionsDeps {
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave) => void;
  getStats: () => PlayerStats | null;
  setStats: (s: PlayerStats) => void;
  getGame: () => Phaser.Game | null;
  getLocation: () => GameLocationConfig | null;
  setLocation: (loc: GameLocationConfig) => void;
  toGameLocation: (loc: LocationDefinition) => GameLocationConfig;
  updateHud: (save: PlayerSave, stats?: PlayerStats) => void;
  showToast: (text: string) => void;
  syncUiBlocked: () => void;
  deathScreen: HTMLElement;
  transitionLocation: () => void;
}

export function createRespawnActions(deps: RespawnActionsDeps) {
  let pending = false;
  let allyPending = false;
  let generation = 0;
  function context(save: PlayerSave, game: Phaser.Game): () => boolean {
    const location = deps.getLocation();
    const epoch = ++generation;
    return () => epoch === generation && deps.getSave()?.id === save.id && deps.getSave()?.location === save.location && deps.getGame() === game && deps.getLocation() === location;
  }
  function syncBusy(): void {
    const button = document.getElementById('respawn-btn');
    button?.toggleAttribute('disabled', pending);
    button?.setAttribute('aria-busy', String(pending));
  }
  function applyRespawn(result: Awaited<ReturnType<typeof respawnSave>>, game: Phaser.Game): void {
    deps.setSave(result.save);
    deps.setStats(result.stats);
    deps.updateHud(result.save, result.stats);
    deps.deathScreen.classList.remove('visible');
    resetDeathScreen();
    const relocated =
      Boolean(result.relocated) ||
      (result.location ? deps.getLocation()?.id !== result.location.id : false);
    const notes = [
      result.xpLost && result.xpLost > 0 ? `−${result.xpLost} XP` : '',
      result.adenaLost && result.adenaLost > 0 ? `−${result.adenaLost} адены` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const note = notes ? ` · ${notes}` : '';
    const verb =
      result.deathKind === 'faint'
        ? 'Пришёл в себя'
        : result.deathKind === 'doom'
          ? 'Поднялся после Гибели'
          : 'Воскрес';
    if (relocated && result.location) {
      deps.setLocation(deps.toGameLocation(result.location));
      deps.showToast(`${verb} в Гавани${note}`);
      deps.transitionLocation();
    } else {
      getGameScene(game).respawnPlayer(result.save, result.stats);
      deps.showToast(`${verb}${note}`);
    }
    deps.syncUiBlocked();
  }
  async function handleRespawn(): Promise<void> {
    const save = deps.getSave();
    const game = deps.getGame();
    if (!save || !game || pending) return;
    const current = context(save, game);
    const token = generation;
    pending = true; syncBusy();
    try {
      const result = await respawnSave(save.id, AbortSignal.timeout(10_000));
      if (!current() || (deps.getSave()?.revision ?? 0) > (result.save.revision ?? 0)) return;
      applyRespawn(result, game);
    } catch (err) {
      if (!current()) return;
      try {
        const signal = AbortSignal.timeout(5000);
        const fresh = await fetchSave(save.id, signal);
        if (!current()) return;
        if (fresh.hp > 0) {
          const [stats, location] = await Promise.all([fetchStats(save.id, signal), fetchLocation(fresh.location, signal)]);
          if (!current()) return;
          if ((deps.getSave()?.revision ?? 0) <= (fresh.revision ?? 0)) applyRespawn({ save: fresh, stats, location }, game);
          return;
        }
      } catch { /* Keep the death screen available for another attempt. */ }
      if (current()) deps.showToast(err instanceof Error ? err.message : 'Не удалось воскреснуть');
    } finally {
      if (token === generation) { pending = false; syncBusy(); }
    }
  }

  async function applyAllyResurrection(payload: {
    targetSaveId: string;
    casterName: string;
  }): Promise<void> {
    const save = deps.getSave();
    const game = deps.getGame();
    if (!save || payload.targetSaveId !== save.id || !game || allyPending) return;
    const current = context(save, game);
    const token = generation;
    allyPending = true; pending = true; syncBusy();
    try {
      const signal = AbortSignal.timeout(10_000);
      const next = await fetchSave(save.id, signal);
      if (!current() || next.hp <= 0 || (deps.getSave()?.revision ?? 0) > (next.revision ?? 0)) return;
      const [nextStats, location] = await Promise.all([
        fetchStats(save.id, signal),
        next.location !== deps.getLocation()?.id ? fetchLocation(next.location, signal) : Promise.resolve(null),
      ]);
      if (!current() || (deps.getSave()?.revision ?? 0) > (next.revision ?? 0)) return;
      deps.setSave(next);
      deps.setStats(nextStats);
      deps.updateHud(next, nextStats);
      deps.deathScreen.classList.remove('visible');
      resetDeathScreen();
      if (location) {
        deps.setLocation(deps.toGameLocation(location));
        deps.transitionLocation();
      } else getGameScene(game).respawnPlayer(next, nextStats);
      deps.showToast(`${payload.casterName} воскресил вас свитком`);
      deps.syncUiBlocked();
    } catch {
      if (current()) deps.showToast('Вас воскресили — обновите состояние');
    } finally {
      if (token === generation) { allyPending = false; pending = false; syncBusy(); }
    }
  }

  return { handleRespawn, applyAllyResurrection };
}
