import type { PlayerSave, PlayerStats } from './api.js';

export interface AppUi {
  updateHud: (
    next: PlayerSave,
    nextStats?: PlayerStats,
    opts?: { combatTick?: boolean },
  ) => void;
  syncUiBlocked: () => void;
  showDialogue: (npcId: string, channel?: 'proximity' | 'radio') => Promise<void>;
}

/**
 * Mutable UI façade bound once overlays/dialogue exist.
 * Callers always go through `ui.*` — never capture unbound function refs.
 */
export function createAppUiSlot() {
  let impl: AppUi | null = null;

  const ui: AppUi = {
    updateHud: (next, nextStats, opts) => {
      impl?.updateHud(next, nextStats, opts);
    },
    syncUiBlocked: () => {
      impl?.syncUiBlocked();
    },
    showDialogue: async (npcId, channel) => {
      if (!impl) return;
      await impl.showDialogue(npcId, channel);
    },
  };

  function bindUi(next: AppUi): void {
    impl = next;
  }

  return { ui, bindUi };
}

export type AppUiSlot = ReturnType<typeof createAppUiSlot>;
