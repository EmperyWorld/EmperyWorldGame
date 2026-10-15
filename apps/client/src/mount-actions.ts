import { locationDisallowsMount } from '@empery/shared';
import {
  toggleMount,
  dismountMount,
  type PlayerSave,
  type PlayerStats,
  type LocationDefinition,
} from './api.js';
import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';

export interface MountActionsDeps {
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave) => void;
  getStats: () => PlayerStats | null;
  setStats: (s: PlayerStats) => void;
  getGame: () => Phaser.Game | null;
  getLocation: () => Pick<LocationDefinition, 'privateOwnerOnly' | 'dayNight'> | null;
  updateHud: (save: PlayerSave, stats?: PlayerStats | null) => void;
  showToast: (text: string) => void;
}

export function createMountActions(deps: MountActionsDeps) {
  let pending: Promise<boolean> | null = null;

  function sameContext(origin: PlayerSave, game: Phaser.Game | null): boolean {
    const current = deps.getSave();
    return current?.id === origin.id && current.location === origin.location && deps.getGame() === game;
  }

  async function transition(kind: 'toggle' | 'dismount'): Promise<boolean> {
    const save = deps.getSave();
    if (!save) return false;
    const game = deps.getGame();
    try {
      const result = kind === 'toggle' ? await toggleMount(save.id) : await dismountMount(save.id);
      if (!sameContext(save, game)) return false;
      const current = deps.getSave()!;
      // A later authoritative save already includes this transition. Never roll it back.
      if ((current.revision ?? 0) > (result.save.revision ?? 0)) {
        return kind === 'dismount' && !current.mount?.mounted;
      }
      deps.setSave(result.save);
      deps.setStats(result.stats);
      deps.updateHud(result.save, result.stats);
      if (game) {
        try { getGameScene(game).updateSave(result.save, result.stats); }
        catch { /* The scene can shut down while the request is in flight. */ }
      }
      if ('message' in result && typeof result.message === 'string') deps.showToast(result.message);
      return true;
    } catch (err) {
      if (sameContext(save, game)) deps.showToast(err instanceof Error ? err.message : 'Не удалось изменить состояние коня');
      return false;
    }
  }

  function startTransition(kind: 'toggle' | 'dismount'): Promise<boolean> {
    const operation = transition(kind);
    pending = operation;
    syncMountButton();
    void operation.finally(() => {
      if (pending === operation) pending = null;
      syncMountButton();
    });
    return operation;
  }

  async function handleToggleMount(): Promise<void> {
    if (pending) return;
    const save = deps.getSave();
    if (!save) return;
    const loc = deps.getLocation();
    if (loc && locationDisallowsMount(loc) && !save.mount?.mounted) {
      deps.showToast('В помещении нельзя сесть на коня');
      return;
    }
    await startTransition('toggle');
  }

  async function ensureDismounted(): Promise<boolean> {
    const origin = deps.getSave();
    const game = deps.getGame();
    if (!origin) return false;
    // An interaction requested during mounting waits for that result, then dismounts.
    // Concurrent interactions share the pending transition rather than racing it.
    while (pending) {
      await pending;
      if (!sameContext(origin, game)) return false;
    }
    if (!sameContext(origin, game)) return false;
    if (!deps.getSave()?.mount?.mounted) return true;
    return startTransition('dismount');
  }

  function syncMountButton(): void {
    const btn = document.getElementById('action-mount');
    const label = document.getElementById('action-mount-label');
    if (!btn || !label) return;
    const setMountLabel = (text: string): void => {
      label.innerHTML = `<img class="hud-action-icon" alt="" src="/media/assets/ui_action_mount.webp" />${text}`;
    };
    const save = deps.getSave();
    const stats = deps.getStats();
    btn.toggleAttribute('disabled', pending !== null);
    btn.setAttribute('aria-busy', String(pending !== null));
    const owned = Boolean(save?.mount?.ownedId);
    const mounted = Boolean(save?.mount?.mounted);
    const chargeMs = stats?.mountChargeRemainingMs ?? 0;
    btn.classList.toggle('open', mounted);
    btn.classList.toggle('on-cooldown', mounted && chargeMs > 0);
    btn.setAttribute('aria-pressed', String(mounted));
    if (!owned) {
      btn.title = 'Нет лошади — купи у торговца';
      setMountLabel('Конь');
    } else if (mounted && chargeMs > 0) {
      const sec = Math.ceil(chargeMs / 1000);
      btn.title = `Таран через ${sec} с · H — спешиться`;
      setMountLabel(`${sec}с`);
    } else if (mounted) {
      btn.title = 'Спешиться [H] · Shift — рывок и таран';
      setMountLabel('Верхом');
    } else {
      btn.title = 'Сесть на коня [H]';
      setMountLabel('Конь');
    }
  }

  return { handleToggleMount, ensureDismounted, syncMountButton };
}
