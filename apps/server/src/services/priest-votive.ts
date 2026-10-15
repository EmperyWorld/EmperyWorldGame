/**
 * Haven cathedral votive loop (Отец Кассий, town_priest):
 * paid candle + mpRegen buff, repeatable alms counter.
 * Bless/confess stay in haven-services — this module does not import it.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const PRIEST_NPC_ID = 'town_priest';

export const PRIEST_CANDLE_COST = 8;
export const PRIEST_ALMS_COST = 20;

export const CASSIUS_CANDLE_ITEM = 'cassius_candle';
export const HAVEN_PRIEST_ALMS_FLAG = 'haven_priest_alms';

export const CASSIUS_VOTIVE_BUFF_ID = 'cassius_votive';
export const CASSIUS_VOTIVE_BUFF_STAT = 'mpRegen' as const;
export const CASSIUS_VOTIVE_BUFF_AMOUNT = 4;
export const CASSIUS_VOTIVE_BUFF_DURATION_MS = 20 * 60 * 1000;
export const CASSIUS_VOTIVE_BUFF_NAME = 'Храмовая свеча';

export interface PriestVotiveResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export function priestAlmsCount(save: PlayerSave): number {
  return Number(save.questFlags[HAVEN_PRIEST_ALMS_FLAG] ?? 0) || 0;
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

/** Храмовая свеча: 8 адены, предмет cassius_candle + бафф «Храмовая свеча». Повтор разрешён. */
export function buyCassiusCandle(save: PlayerSave): PriestVotiveResult {
  const paid = payOrFail(
    save,
    PRIEST_CANDLE_COST,
    `Свеча стоит ${PRIEST_CANDLE_COST} адены. Воск и фитиль собор даром не ставит.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  let next = appendItemsToSave(paid.save, [CASSIUS_CANDLE_ITEM]);
  next = applyNamedBuff(next, {
    buffId: CASSIUS_VOTIVE_BUFF_ID,
    buffStat: CASSIUS_VOTIVE_BUFF_STAT,
    buffName: CASSIUS_VOTIVE_BUFF_NAME,
    amount: CASSIUS_VOTIVE_BUFF_AMOUNT,
    durationMs: CASSIUS_VOTIVE_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(next);
  publish(finalSave, 'PRIEST_CANDLE', { cost: PRIEST_CANDLE_COST });

  return {
    save: finalSave,
    ok: true,
    message: `Кассий зажигает фитиль и протягивает свечу. Получена «${CASSIUS_VOTIVE_BUFF_NAME}» (+${CASSIUS_VOTIVE_BUFF_AMOUNT} к регену маны на 20 мин).`,
  };
}

/** Милостыня собору: 20 адены, счётчик haven_priest_alms += 1, без предмета. Повтор разрешён. */
export function givePriestAlms(save: PlayerSave): PriestVotiveResult {
  const paid = payOrFail(
    save,
    PRIEST_ALMS_COST,
    `Милостыня — ${PRIEST_ALMS_COST} адены. Собор кормит странников, но свечи тоже покупают.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const nextCount = priestAlmsCount(paid.save) + 1;
  const next: PlayerSave = {
    ...paid.save,
    questFlags: {
      ...paid.save.questFlags,
      [HAVEN_PRIEST_ALMS_FLAG]: nextCount,
    },
  };
  publish(next, 'PRIEST_ALMS', { cost: PRIEST_ALMS_COST, alms: nextCount });

  return {
    save: next,
    ok: true,
    message: 'Кассий принимает медь без лишних слов. Собор помнит доброе.',
  };
}
