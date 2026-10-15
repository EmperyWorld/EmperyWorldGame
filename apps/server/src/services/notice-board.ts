/**
 * Haven municipal notice board service (городская доска объявлений).
 * Handles contracts, bounties, municipal news and rumors.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { getLatestRumors } from './rumors.js';
import { worldEvents } from './world-events.js';

export const BOARD_BOUNTY_ACTIVE_FLAG = 'quest_board_bounty_active';
export const BOARD_BOUNTY_COMPLETE_FLAG = 'quest_board_bounty_complete';
export const BOARD_BOUNTY_KILLS_FLAG = 'quest_board_bounty_kills';
export const BOARD_BOUNTY_TARGET_KILLS = 3;
export const BOARD_BOUNTY_REWARD_ADENA = 120;
export const BOARD_BOUNTY_REWARD_ITEM = 'field_bandage';

export interface NoticeBoardActionResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

export function acceptBoardBounty(save: PlayerSave): NoticeBoardActionResult {
  if (hasFlag(save, BOARD_BOUNTY_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Текущий контракт магистрата уже закрыт. Новые разнарядки поступят со следующим караваном.',
    };
  }
  if (hasFlag(save, BOARD_BOUNTY_ACTIVE_FLAG)) {
    const kills = Number(save.questFlags[BOARD_BOUNTY_KILLS_FLAG] ?? 0);
    return {
      save,
      ok: true,
      message: `Контракт уже активен: уничтожено ${kills}/${BOARD_BOUNTY_TARGET_KILLS} чудовищ на подступах к городу.`,
    };
  }

  const next: PlayerSave = {
    ...save,
    questFlags: {
      ...save.questFlags,
      [BOARD_BOUNTY_ACTIVE_FLAG]: true,
      [BOARD_BOUNTY_KILLS_FLAG]: save.questFlags[BOARD_BOUNTY_KILLS_FLAG] ?? 0,
    },
  };

  return {
    save: next,
    ok: true,
    message: `Контракт подписан! Уничтожьте ${BOARD_BOUNTY_TARGET_KILLS} противников на подступах к Гавани (гоблины, разбойники или орки) и вернитесь к доске за наградой.`,
  };
}

export function claimBoardBounty(save: PlayerSave): NoticeBoardActionResult {
  if (hasFlag(save, BOARD_BOUNTY_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Награда по этому контракту уже была получена.',
    };
  }
  if (!hasFlag(save, BOARD_BOUNTY_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала сорвите и примите контракт с доски объявлений.',
    };
  }

  const kills = Number(save.questFlags[BOARD_BOUNTY_KILLS_FLAG] ?? 0);
  const groveDone = hasFlag(save, 'quest_grove_complete');
  const satisfied = kills >= BOARD_BOUNTY_TARGET_KILLS || groveDone;

  if (!satisfied) {
    return {
      save,
      ok: false,
      message: `Условия контракта ещё не выполнены (прогресс: ${kills}/${BOARD_BOUNTY_TARGET_KILLS}). Награда выдаётся только за чистую работу.`,
    };
  }

  const nextGold = (save.adena ?? 0) + BOARD_BOUNTY_REWARD_ADENA;
  const withGold: PlayerSave = {
    ...save,
    adena: nextGold,
    questFlags: {
      ...save.questFlags,
      [BOARD_BOUNTY_COMPLETE_FLAG]: true,
    },
  };
  delete withGold.questFlags[BOARD_BOUNTY_ACTIVE_FLAG];

  const withItem = appendItemsToSave(withGold, [BOARD_BOUNTY_REWARD_ITEM]);
  const finalSave = applyStatsToSave(withItem);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'BOARD_BOUNTY_CLAIMED', rewardAdena: BOARD_BOUNTY_REWARD_ADENA },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message: `Контракт закрыт магистратом! Получено ${BOARD_BOUNTY_REWARD_ADENA} адены и походный бинт (${BOARD_BOUNTY_REWARD_ITEM}).`,
  };
}

export function formatBoardNews(): string {
  const rumors = getLatestRumors().slice(0, 4);
  const header = '[ВЕСТНИК ИМПЕРСКОЙ ГАВАНИ]\nГородские вести, слухи трактиров и приказы коменданта:\n';
  if (rumors.length === 0 || (rumors.length === 1 && rumors[0] === 'В городе подозрительно тихо...')) {
    return (
      header +
      '• Порядок на улицах поддерживается стражей капитана Гаррета.\n' +
      '• Караваны с зерном прибыли с полей без задержек.\n' +
      '• В таверне у Марты свежий портовый эль и горячее рагу.\n' +
      '• Магистрат напоминает: соблюдайте осторожность у ворот кампуса EmperyWorld.'
    );
  }
  return header + rumors.map((r) => `• ${r}`).join('\n');
}
