/**
 * Haven notice board extras (town_notice_board):
 * paid bulletin copy + one-time magistrate petition.
 * Grove bounty stays in notice-board.ts — do not duplicate it here.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';
import { worldEvents } from './world-events.js';

export const NOTICE_BOARD_NPC_ID = 'town_notice_board';

export const BOARD_COPY_COST = 6;
export const BOARD_PETITION_COST = 15;

export const FORUM_BULLETIN_ID = 'forum_bulletin';
export const FORUM_SEAL_ID = 'forum_seal';

export const FORUM_PETITION_COMPLETE_FLAG = 'quest_forum_petition_complete';

export interface NoticePetitionResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function payOrFail(
  save: PlayerSave,
  cost: number,
  lackMessage: string,
): { save: PlayerSave; ok: true } | { save: PlayerSave; ok: false; message: string } {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < cost) {
    return { save, ok: false, message: lackMessage };
  }
  return { save: { ...save, adena: currentAdena - cost }, ok: true };
}

function publish(save: PlayerSave, action: string, extra: Record<string, unknown> = {}): void {
  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: save.id,
    locationId: save.location,
    payload: { action, ...extra },
    timestamp: Date.now(),
  });
}

/** Повторная копия листовки с доски (6 адены → forum_bulletin). */
export function copyBoardBulletin(save: PlayerSave): NoticePetitionResult {
  const paid = payOrFail(
    save,
    BOARD_COPY_COST,
    `Копия листовки стоит ${BOARD_COPY_COST} адены. Клей и бумага не даром.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next = appendItemsToSave(paid.save, [FORUM_BULLETIN_ID]);
  publish(next, 'BOARD_COPY_BULLETIN', { cost: BOARD_COPY_COST });
  return {
    save: next,
    ok: true,
    message: 'С доски снята копия. Держи бюллетень — клей ещё сырой, не мни герб.',
  };
}

/** Разовое прошение магистрату (15 адены → forum_seal + quest_forum_petition_complete). */
export function fileBoardPetition(save: PlayerSave): NoticePetitionResult {
  if (hasFlag(save, FORUM_PETITION_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Прошение уже подано. Магистрат не ставит вторую печать по тому же делу.',
    };
  }

  const paid = payOrFail(
    save,
    BOARD_PETITION_COST,
    `Прошение стоит ${BOARD_PETITION_COST} адены. Воск печати и очередь канцелярии — не даром.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const withSeal = appendItemsToSave(paid.save, [FORUM_SEAL_ID]);
  const next: PlayerSave = {
    ...withSeal,
    questFlags: {
      ...withSeal.questFlags,
      [FORUM_PETITION_COMPLETE_FLAG]: true,
    },
  };
  publish(next, 'BOARD_FILE_PETITION', { cost: BOARD_PETITION_COST });
  return {
    save: next,
    ok: true,
    message: 'Прошение принято. Печать магистрата поставлена — повторно канцелярия не слушает.',
  };
}
