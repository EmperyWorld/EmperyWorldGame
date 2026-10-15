import type { PlayerSave, PlayerStats } from './api.js';
import type { HudController } from './hud-controller.js';
import type { OverlayController } from './overlay-controller.js';
import type { DialogueController } from './dialogue-controller.js';

export interface UiBridgeDeps {
  hud: HudController;
  overlays: OverlayController;
  dialogue: DialogueController;
  syncMountButton: () => void;
  ensureDismounted: () => Promise<boolean>;
}

export function createUiBridge(deps: UiBridgeDeps) {
  let dialogueIntent = 0;
  function updateHud(
    next: PlayerSave,
    nextStats?: PlayerStats,
    opts?: { combatTick?: boolean },
  ): void {
    deps.hud.update(next, nextStats, opts);
    deps.syncMountButton();
  }

  function syncUiBlocked(): void {
    deps.overlays.syncUiBlocked();
  }

  async function showDialogue(
    npcId: string,
    channel: 'proximity' | 'radio' = 'proximity',
  ): Promise<void> {
    const intent = ++dialogueIntent;
    if (channel === 'proximity' && !await deps.ensureDismounted()) return;
    if (intent !== dialogueIntent) return;
    await deps.dialogue.show(npcId, channel);
  }

  return { updateHud, syncUiBlocked, showDialogue };
}
