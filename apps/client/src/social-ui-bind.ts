import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import type { PlayerSave } from './api.js';
import { mountChat, appendChatSystem, startWhisper } from './chat-ui.js';
import { mountParty, getPartySnapshot, setPartySelected } from './party-ui.js';
import { mountTargetActions, setTargetUi } from './target-ui.js';

export interface SocialUiBindDeps {
  chatPanelEl: HTMLElement;
  partyPanelEl: HTMLElement;
  targetActionsEl: HTMLElement;
  getGame: () => Phaser.Game | null;
  getSave: () => PlayerSave | null;
  showToast: (text: string) => void;
  syncUiBlocked: () => void;
  resurrectTarget: (saveId: string) => Promise<void>;
}

export function bindSocialUi(deps: SocialUiBindDeps): void {
  const withScene = (fn: (scene: ReturnType<typeof getGameScene>) => void): boolean => {
    const game = deps.getGame();
    if (!game) return false;
    try {
      fn(getGameScene(game));
      return true;
    } catch {
      return false;
    }
  };

  mountChat(deps.chatPanelEl, {
    sendLocation: (text) => {
      if (!withScene((s) => s.sendChat('location', text))) appendChatSystem('Чат недоступен');
    },
    sendGlobal: (text) => {
      if (!withScene((s) => s.sendChat('global', text))) appendChatSystem('Чат недоступен');
    },
    sendPrivate: (toName, text) => {
      if (!withScene((s) => s.sendChat('private', text, toName))) appendChatSystem('Чат недоступен');
    },
    sendParty: (text) => {
      if (!withScene((s) => s.sendChat('party', text))) appendChatSystem('Чат недоступен');
    },
    inviteToParty: (toName) => {
      if (!withScene((s) => s.sendPartyInvite(toName))) appendChatSystem('Пати недоступна');
    },
    onFocusChange: () => deps.syncUiBlocked(),
  });

  mountParty(deps.partyPanelEl, {
    invite: (toName) => {
      if (!withScene((s) => s.sendPartyInvite(toName))) deps.showToast('Пати недоступна');
    },
    accept: (partyId) => {
      if (!withScene((s) => s.sendPartyAccept(partyId))) deps.showToast('Пати недоступна');
    },
    decline: (partyId) => {
      withScene((s) => s.sendPartyDecline(partyId));
    },
    leave: () => {
      withScene((s) => s.sendPartyLeave());
    },
    kick: (saveId) => {
      withScene((s) => s.sendPartyKick(saveId));
    },
    disband: () => {
      withScene((s) => s.sendPartyDisband());
    },
    selectMember: (saveId, name) => {
      const save = deps.getSave();
      if (!save) return;
      withScene((scene) => {
        scene.setPlayerTarget(saveId, name);
        const snap = getPartySnapshot();
        const member = snap?.members.find((m) => m.saveId === saveId);
        if (!member) return;
        if (!member.online) {
          deps.showToast(`${name}: оффлайн`);
          return;
        }
        if (member.locationId && member.locationId !== save.location) {
          deps.showToast(`${name}: ${member.locationName ?? member.locationId}`);
          return;
        }
        if (scene.peekAtPlayer(saveId)) {
          deps.showToast(`${name}: на карте`);
        } else {
          deps.showToast(`${name}: ${member.locationName ?? 'здесь'}`);
        }
      });
    },
    promote: (saveId) => {
      withScene((s) => s.sendPartyPromote(saveId));
    },
    takeAssistTarget: () => {
      const snap = getPartySnapshot();
      if (!snap?.assistTargetSaveId) return;
      withScene((s) =>
        s.setPlayerTarget(snap.assistTargetSaveId!, snap.assistTargetName ?? undefined),
      );
    },
  });

  mountTargetActions(deps.targetActionsEl, {
    invite: (toName) => {
      if (!withScene((s) => s.sendPartyInvite(toName))) {
        deps.showToast('Пати недоступна');
      } else {
        deps.showToast(`Приглашение: ${toName}`);
      }
    },
    whisper: (toName) => {
      startWhisper(toName);
    },
    resurrect: (saveId) => {
      void deps.resurrectTarget(saveId);
    },
    promote: (saveId) => {
      if (withScene((s) => s.sendPartyPromote(saveId))) {
        deps.showToast('Лидер передан');
      }
    },
    assist: (saveId) => {
      if (withScene((s) => s.sendPartyAssist(saveId))) {
        deps.showToast(saveId ? 'Цель пати назначена' : 'Цель пати сброшена');
      }
    },
    clear: () => {
      if (!withScene((s) => s.clearPlayerTarget())) {
        setTargetUi(null, {
          canInvite: false,
          canWhisper: false,
          canResurrect: false,
          canPromote: false,
          canAssist: false,
          assistActive: false,
        });
        setPartySelected(null);
      }
    },
  });
}
