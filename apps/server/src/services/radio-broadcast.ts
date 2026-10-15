/**
 * Haven city broadcast — Связист Рен (town_radio):
 * paid mast-side news + attackSpeed buff; free field-radio signal check.
 * Dialogue wiring lives in radio-broadcast-dialogue.ts.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { RADIO_REPAIR_COST, hasFieldRadio } from './radio.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const HAVEN_BROADCAST_COST = 6;
export const HAVEN_BROADCAST_BUFF_ID = 'haven_broadcast';
export const HAVEN_BROADCAST_BUFF_STAT = 'attackSpeed' as const;
export const HAVEN_BROADCAST_BUFF_AMOUNT = 8;
export const HAVEN_BROADCAST_BUFF_DURATION_MS = 15 * 60 * 1000;
export const HAVEN_BROADCAST_BUFF_NAME = 'Ритм эфира';

export const HAVEN_BROADCAST_NEWS = [
  'У причалов сняли утренний туман — лоцманы просят не торопить швартовку.',
  'На рынке янтарь с южных полей; стража гонит торговлю от ворот.',
  'Ночной дозор на стенах тихий: маяк держит ритм, разломы не пляшут.',
] as const;

export interface RadioBroadcastResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** City news slot: `Date.getUTCHours() % 3`. */
export function havenBroadcastNews(now = new Date()): string {
  const idx = now.getUTCHours() % HAVEN_BROADCAST_NEWS.length;
  return HAVEN_BROADCAST_NEWS[idx] ?? HAVEN_BROADCAST_NEWS[0];
}

/** Rough remaining charge for Ren's report (hours if ≥1.5h, else minutes). */
export function roughRadioChargeLabel(sessionExpiresAt: string, now = Date.now()): string {
  const expires = Date.parse(sessionExpiresAt);
  if (!Number.isFinite(expires)) return 'заряд неясен';
  const remainMs = expires - now;
  if (remainMs <= 0) return 'заряд сел';
  const hours = remainMs / (60 * 60 * 1000);
  if (hours >= 1.5) return `ещё около ${Math.round(hours)} ч`;
  const mins = Math.max(1, Math.round(remainMs / (60 * 1000)));
  return `ещё около ${mins} мин`;
}

/** Paid mast-side broadcast: +attackSpeed («Ритм эфира»), 6 адены. */
export function tuneHavenBroadcast(save: PlayerSave): RadioBroadcastResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < HAVEN_BROADCAST_COST) {
    return {
      save,
      ok: false,
      message: `Эфир стоит ${HAVEN_BROADCAST_COST} адены. Без звона в кармане мачта молчит.`,
    };
  }

  let nextSave: PlayerSave = { ...save, adena: currentAdena - HAVEN_BROADCAST_COST };
  nextSave = applyNamedBuff(nextSave, {
    buffId: HAVEN_BROADCAST_BUFF_ID,
    buffStat: HAVEN_BROADCAST_BUFF_STAT,
    buffName: HAVEN_BROADCAST_BUFF_NAME,
    amount: HAVEN_BROADCAST_BUFF_AMOUNT,
    durationMs: HAVEN_BROADCAST_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'HAVEN_BROADCAST', cost: HAVEN_BROADCAST_COST },
    timestamp: Date.now(),
  });

  const news = havenBroadcastNews();
  return {
    save: finalSave,
    ok: true,
    message: `Рен крутит ручку приёмника: «${news}» Получен бафф «${HAVEN_BROADCAST_BUFF_NAME}» (+${HAVEN_BROADCAST_BUFF_AMOUNT} к скорости атаки на 15 мин).`,
  };
}

/** Free signal check. Does not mutate radio.ts lifecycle. */
export function radioSignalCheck(save: PlayerSave): RadioBroadcastResult {
  if (save.radio?.broken) {
    return {
      save,
      ok: true,
      message: `Корпус мёртвый. Чиню за ${RADIO_REPAIR_COST} adena — потом снова поймаем частоты.`,
    };
  }

  const sessionExpiresAt = save.radio?.sessionExpiresAt;
  if (typeof sessionExpiresAt === 'string' && sessionExpiresAt.length > 0) {
    const powerOn = Boolean(save.radio?.powerOn);
    const charge = roughRadioChargeLabel(sessionExpiresAt);
    return {
      save,
      ok: true,
      message: `Питание ${powerOn ? 'включено' : 'выключено'}, ${charge}.`,
    };
  }

  if (hasFieldRadio(save)) {
    return { save, ok: true, message: 'Рация в порядке' };
  }
  return { save, ok: true, message: 'Рации нет — купи у меня' };
}
