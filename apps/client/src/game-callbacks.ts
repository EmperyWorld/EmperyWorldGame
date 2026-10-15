import type { CompanionFetchStartedPayload, GroundLootRemovedPayload } from '@empery/shared';
import {
  fetchSave,
  fetchStats,
  syncMountStamina,
  syncPlayerStamina,
  type PlayerSave,
  type PlayerStats,
} from './api.js';
import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import type { HudController } from './hud-controller.js';
import { appendChatMessage, appendChatSystem } from './chat-ui.js';
import {
  applyPartySnapshot,
  applyPartyInvite,
  patchPartyMemberVitals,
} from './party-ui.js';
import { showRadioIncoming } from './radio-call-ui.js';
import { syncDeathScreen } from './death-ui.js';

export interface GameCallbacksDeps {
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave) => void;
  getStats: () => PlayerStats | null;
  setStats: (s: PlayerStats | null) => void;
  getGame: () => Phaser.Game | null;
  hud: HudController;
  deathScreen: HTMLElement;
  updateHud: (save: PlayerSave, stats?: PlayerStats | null, opts?: { combatTick?: boolean }) => void;
  showToast: (text: string) => void;
  syncUiBlocked: () => void;
  syncMountButton: () => void;
  showDialogue: (npcId: string) => Promise<void>;
  openStationPanel: (kinds: Array<'campfire' | 'hearth' | 'water' | 'pot'>) => void;
  ensureMediaManifest: () => Promise<void>;
  handleSkillsChanged: (unlocked?: string[]) => Promise<void>;
  doTravel: (locationId: string) => Promise<void>;
  syncPartyRegistry: () => void;
  syncPartyXpFromScene: () => void;
  refreshTargetActions: (target: { saveId: string; name: string } | null) => void;
  applyAllyResurrection: (payload: {
    targetSaveId: string;
    casterSaveId: string;
    casterName: string;
    targetName: string;
  }) => Promise<void>;
}

export function createGameCallbacks(deps: GameCallbacksDeps) {
  return {
    onSaveUpdate: (next: PlayerSave, s?: PlayerStats, opts?: { combatTick?: boolean }) => {
      deps.updateHud(next, s ?? deps.getStats() ?? undefined, opts);
      patchPartyMemberVitals(next.id, {
        hp: next.hp,
        maxHp: next.maxHp,
        mp: next.mp,
        maxMp: next.maxMp,
        online: true,
      });
    },
    onTalkNpc: (npcId: string) => {
      void deps.showDialogue(npcId).then(() => deps.syncUiBlocked());
    },
    onUseStation: (kinds: Array<'campfire' | 'hearth' | 'water' | 'pot'>) => {
      deps.openStationPanel(kinds);
      deps.syncUiBlocked();
    },
    onCombatFeedback: (text: string) => deps.showToast(text),
    onRadioIncoming: (npcId: string) => {
      void deps
        .ensureMediaManifest()
        .catch(() => undefined)
        .finally(() => showRadioIncoming(npcId));
    },
    onSkillsChanged: (unlocked?: string[]) => void deps.handleSkillsChanged(unlocked),
    onPlayerDeath: () => {
      let save = deps.getSave();
      if (save?.mount?.mounted) {
        save = { ...save, mount: { ...save.mount, mounted: false } };
        deps.setSave(save);
        const stats = deps.getStats();
        if (stats) deps.setStats({ ...stats, mounted: false, speed: stats.speed });
      }
      deps.syncMountButton();
      syncDeathScreen(save?.lastDeathCause, save?.lastDeathKind);
      deps.deathScreen.classList.add('visible');
      deps.syncUiBlocked();
    },
    onTravelLocation: (locationId: string) => {
      void deps.doTravel(locationId);
    },
    onAutoAttackToggle: (active: boolean, remainingMs: number) => {
      deps.hud.syncAutoAttackButton(active, remainingMs);
      deps.showToast(active ? 'Автоатака 30с' : 'Автоатака выкл');
      if (active) deps.hud.startAutoAttackUiTicker();
    },
    onMountStamina: (
      info: {
        owned: boolean;
        mounted: boolean;
        stamina: number;
        max: number;
        canRun: boolean;
        carryWeightKg: number;
      } | null,
    ) => {
      deps.hud.updateMountStamina(info);
    },
    onMountStaminaSync: (stamina: number) => {
      const save = deps.getSave();
      if (!save) return;
      void syncMountStamina(save.id, { stamina })
        .then((result) => {
          const cur = deps.getSave();
          if (!cur || cur.id !== result.save.id) return;
          deps.setSave({
            ...cur,
            mount: result.save.mount ?? cur.mount,
          });
          const stats = deps.getStats();
          if (stats) {
            deps.setStats({
              ...stats,
              mountStamina: result.stats.mountStamina ?? stamina,
              mountCanRun: result.stats.mountCanRun ?? stats.mountCanRun,
            });
          }
        })
        .catch(() => {
          /* offline / transient */
        });
    },
    onPlayerStamina: (info: {
      stamina: number;
      max: number;
      canRun: boolean;
      carryWeightKg: number;
    }) => {
      deps.hud.updatePlayerStamina(info);
    },
    onPlayerStaminaSync: (stamina: number) => {
      const save = deps.getSave();
      if (!save) return;
      void syncPlayerStamina(save.id, stamina)
        .then((result) => {
          const cur = deps.getSave();
          if (!cur || cur.id !== result.save.id) return;
          deps.setSave({
            ...cur,
            stamina: result.save.stamina ?? stamina,
            staminaAt: result.save.staminaAt ?? cur.staminaAt,
          });
          const stats = deps.getStats();
          if (stats) {
            deps.setStats({
              ...stats,
              stamina: result.stats.stamina ?? stamina,
              staminaCanRun: result.stats.staminaCanRun ?? stats.staminaCanRun,
            });
          }
        })
        .catch(() => {
          /* offline / transient */
        });
    },
    onTimedBuffs: (buffs: Array<{ id: string; name: string; remainingMs: number; detail?: string }>) => {
      deps.hud.upsertBuffs(buffs, { replaceCombat: true });
    },
    onChatMessage: (msg: import('./api.js').MultiplayerChatMessage) => {
      appendChatMessage(msg, deps.getSave()?.id);
    },
    onChatError: (error: string) => {
      appendChatSystem(error);
    },
    onPartySnapshot: (party: import('./api.js').PartySnapshot | null) => {
      applyPartySnapshot(party);
      deps.syncPartyRegistry();
      deps.syncPartyXpFromScene();
      const game = deps.getGame();
      if (game) {
        try {
          const tid = getGameScene(game).getPlayerTargetSaveId();
          if (tid) {
            const presence = getGameScene(game).remotePlayers.getPresence(tid);
            const name =
              presence?.name ??
              party?.members.find((m) => m.saveId === tid)?.name ??
              'Игрок';
            deps.refreshTargetActions({ saveId: tid, name });
          }
        } catch {
          /* ignore */
        }
      }
    },
    onPartyInvite: (invite: import('./api.js').PartyInvitePayload) => {
      applyPartyInvite(invite);
      appendChatSystem(`${invite.fromName} зовёт в пати`);
      deps.showToast(`Пати: ${invite.fromName}`);
    },
    onPartyError: (error: string) => {
      appendChatSystem(error);
      deps.showToast(error);
    },
    onPartyMemberVitals: (
      saveId: string,
      vitals: {
        hp?: number;
        maxHp?: number;
        mp?: number;
        maxMp?: number;
        online?: boolean;
        locationId?: string | null;
        locationName?: string | null;
        pvpStatus?: string;
        inCombat?: boolean;
        buffLabels?: Array<{ id: string; name: string; remainingMs: number; detail?: string }>;
      },
    ) => {
      patchPartyMemberVitals(saveId, vitals);
      deps.syncPartyXpFromScene();
    },
    onPartyMemberLeft: (saveId: string) => {
      patchPartyMemberVitals(saveId, { online: false });
    },
    onPlayerTarget: (target: { saveId: string; name: string } | null) => {
      deps.refreshTargetActions(target);
    },
    onPartyXp: (payload: import('./api.js').PartyXpSharePayload) => {
      appendChatSystem(`Пати XP +${payload.xpGained} (от ${payload.fromName})`);
      if (payload.leveledUp) deps.showToast('Уровень!');
      const save = deps.getSave();
      if (!save) return;
      void fetchSave(save.id).then(async (next) => {
        deps.setSave(next);
        const s = await fetchStats(next.id);
        deps.setStats(s);
        deps.updateHud(next, s);
        const game = deps.getGame();
        if (game) {
          try {
            getGameScene(game).updateSave(next, s);
          } catch {
            /* scene may ignore */
          }
        }
      });
    },
    onPartyQuest: (payload: import('./api.js').PartyQuestSharePayload) => {
      if (payload.activatedFlag) {
        appendChatSystem(`Пати: квест от ${payload.fromName}`);
        deps.showToast('Квест принят (пати)');
      } else {
        appendChatSystem(`Пати-квест: килл от ${payload.fromName}`);
        if (payload.questCompleted) {
          deps.showToast(
            payload.radioNpcId
              ? 'Квест пати выполнен — входящий вызов'
              : 'Квест пати выполнен!',
          );
          appendChatSystem('Квест завершён (пати)');
        } else {
          deps.showToast('Прогресс квеста (пати)');
        }
      }
      if (payload.radioNpcId) {
        void deps
          .ensureMediaManifest()
          .catch(() => undefined)
          .finally(() => showRadioIncoming(payload.radioNpcId!));
      }
      const save = deps.getSave();
      if (!save) return;
      void fetchSave(save.id).then(async (next) => {
        deps.setSave(next);
        const s = await fetchStats(next.id);
        deps.setStats(s);
        deps.updateHud(next, s);
        const game = deps.getGame();
        if (game) {
          try {
            getGameScene(game).updateSave(next, s);
          } catch {
            /* ignore */
          }
        }
      });
    },
    onPvpStatus: (status: {
      karma: number;
      pvpStatus: string;
      pvpFlagRemainingMs?: number;
    }) => {
      const save = deps.getSave();
      if (!save) return;
      const next = { ...save, karma: status.karma };
      deps.setSave(next);
      deps.hud.renderPvp(next, status);
    },
    onPlayerResurrected: (payload: {
      targetSaveId: string;
      casterSaveId: string;
      casterName: string;
      targetName: string;
    }) => {
      void deps.applyAllyResurrection(payload);
    },
    onGroundLootSnapshot: (piles: import('@empery/shared').GroundLootPile[] | undefined) => {
      const game = deps.getGame();
      if (!game) return;
      try {
        getGameScene(game).applyGroundLootSnapshot?.(piles);
      } catch {
        /* ignore */
      }
    },
    onGroundLootSpawned: (pile: import('@empery/shared').GroundLootPile) => {
      const game = deps.getGame();
      if (!game) return;
      try {
        getGameScene(game).applyGroundLootSpawned?.(pile);
      } catch {
        /* ignore */
      }
    },
    onGroundLootRemoved: (payload: GroundLootRemovedPayload) => {
      const game = deps.getGame();
      if (!game) return;
      try {
        getGameScene(game).applyGroundLootRemoved?.(payload);
      } catch {
        /* ignore */
      }
    },
    onCompanionFetchStarted: (payload: CompanionFetchStartedPayload) => {
      const game = deps.getGame();
      if (!game) return;
      try {
        getGameScene(game).applyCompanionFetchStarted?.(payload);
      } catch {
        /* ignore */
      }
    },
    onLootPicked: (payload: {
      ok: boolean;
      error?: string;
      lootId?: string;
      saveId: string;
      summary?: string;
    }) => {
      const save = deps.getSave();
      if (!save || save.id !== payload.saveId) return;
      if (payload.summary) deps.showToast(`Подобрано: ${payload.summary}`);
      void fetchSave(save.id).then(async (next) => {
        deps.setSave(next);
        const s = await fetchStats(next.id);
        deps.setStats(s);
        deps.updateHud(next, s);
        const game = deps.getGame();
        if (game) {
          try {
            getGameScene(game).updateSave(next, s);
          } catch {
            /* ignore */
          }
        }
      });
    },
    onCompanionTamed: (payload: { saveId: string; kind: string; variantId: string }) => {
      const save = deps.getSave();
      if (!save || save.id !== payload.saveId) return;
      deps.showToast('Чайка теперь с тобой');
      void fetchSave(save.id).then(async (next) => {
        deps.setSave(next);
        const s = await fetchStats(next.id);
        deps.setStats(s);
        deps.updateHud(next, s);
        const game = deps.getGame();
        if (game) {
          try {
            getGameScene(game).updateSave(next, s);
          } catch {
            /* ignore */
          }
        }
      });
    },
  };
}
