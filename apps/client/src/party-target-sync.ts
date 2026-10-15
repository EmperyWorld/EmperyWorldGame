import { resurrectAlly, type PlayerSave, type PlayerStats } from './api.js';
import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import {
  getPartySnapshot,
  getPartyMemberSaveIds,
  setPartyXpContext,
  setPartySelected,
  isInPartyWith,
  isPartyLeader,
} from './party-ui.js';
import { setTargetUi } from './target-ui.js';
import { isInventoryOpen, refreshInventoryChrome } from './inventory-ui.js';

export interface PartyTargetSyncDeps {
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave) => void;
  getStats: () => PlayerStats | null;
  setStats: (s: PlayerStats) => void;
  getGame: () => Phaser.Game | null;
  updateHud: (save: PlayerSave, stats?: PlayerStats | null) => void;
  showToast: (text: string) => void;
}

export function createPartyTargetSync(deps: PartyTargetSyncDeps) {
  async function resurrectTarget(targetSaveId: string): Promise<void> {
    const save = deps.getSave();
    const game = deps.getGame();
    if (!save || !game) return;
    if (save.hp <= 0) {
      deps.showToast('Свиток только живым');
      return;
    }
    const hasScroll = save.inventory.includes('resurrection_scroll');
    if (!hasScroll) {
      deps.showToast('Нет свитка воскрешения');
      return;
    }
    try {
      const result = await resurrectAlly(save.id, targetSaveId);
      deps.setSave(result.save);
      deps.setStats(result.stats);
      deps.updateHud(result.save, result.stats);
      deps.showToast(result.message);
      if (isInventoryOpen()) refreshInventoryChrome();
    } catch (err) {
      deps.showToast(err instanceof Error ? err.message : 'Не удалось воскресить');
    }
  }

  function syncPartyRegistry(): void {
    const game = deps.getGame();
    if (!game) return;
    try {
      const snap = getPartySnapshot();
      game.registry.set('partySaveIds', new Set(getPartyMemberSaveIds()));
      const assistId = snap?.assistTargetSaveId ?? null;
      game.registry.set('partyAssistSaveId', assistId);
      getGameScene(game).remotePlayers.setAssistTarget(assistId);
    } catch {
      /* ignore */
    }
  }

  function syncPartyXpFromScene(): void {
    const game = deps.getGame();
    const save = deps.getSave();
    if (!game || !save) {
      setPartyXpContext({ selfLocationId: save?.location ?? null, positions: new Map(), selfPos: null });
      return;
    }
    try {
      const scene = getGameScene(game);
      const positions = new Map<string, { x: number; y: number }>();
      scene.remotePlayers.forEachAlive((x, y, presence) => {
        positions.set(presence.saveId, { x, y });
      });
      setPartyXpContext({
        selfLocationId: save.location,
        positions,
        selfPos: scene.getPlayerWorldPos(),
      });
    } catch {
      setPartyXpContext({ selfLocationId: save.location, positions: new Map(), selfPos: null });
    }
  }

  function refreshTargetActions(target: { saveId: string; name: string } | null): void {
    setPartySelected(target?.saveId ?? null);
    const save = deps.getSave();
    if (!target || !save || target.saveId === save.id) {
      setTargetUi(null, {
        canInvite: false,
        canWhisper: false,
        canResurrect: false,
        canPromote: false,
        canAssist: false,
        assistActive: false,
      });
      return;
    }
    const snap = getPartySnapshot();
    const inParty = isInPartyWith(target.saveId);
    const leader = isPartyLeader();
    let canResurrect = false;
    let displayName = target.name;
    let disconnected = false;
    try {
      const game = deps.getGame();
      if (game) {
        const presence = getGameScene(game).remotePlayers.getPresence(target.saveId);
        canResurrect = Boolean(presence && presence.hp <= 0);
        disconnected = presence?.connectionStatus === 'disconnected';
        if (disconnected) displayName = `${target.name} · DISCONNECT`;
      }
    } catch {
      canResurrect = false;
    }
    const assistActive = snap?.assistTargetSaveId === target.saveId;
    setTargetUi(
      { saveId: target.saveId, name: displayName },
      {
        canInvite: !inParty && !disconnected,
        canWhisper: true,
        canResurrect,
        canPromote: leader && inParty,
        canAssist: leader,
        assistActive,
      },
    );
  }

  return {
    resurrectTarget,
    syncPartyRegistry,
    syncPartyXpFromScene,
    refreshTargetActions,
  };
}
