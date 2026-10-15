/**
 * Haven tenant rest — Дворецкий Эдмунд (town_steward):
 * cheaper stove rest for apartment owners. Buy/enter stay on the client.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';
import { applyRestRecovery } from './survival.js';
import { worldEvents } from './world-events.js';

/** Cheaper than inn rest (25). */
export const TENANT_REST_COST = 8;
export const TENANT_REST_FATIGUE_RELIEF = 40;
export const TENANT_REST_MINUTES = 20;

export const TENANT_REST_BUFF_ID = 'tenant_rest';
export const TENANT_REST_BUFF_STAT = 'mpRegen' as const;
export const TENANT_REST_BUFF_AMOUNT = 8;
export const TENANT_REST_BUFF_DURATION_MS = 20 * 60 * 1000;
export const TENANT_REST_BUFF_NAME = 'Тепло печи';

export const TENANT_REST_NO_KEY = 'Сначала ключ от квартиры';

export interface StewardRestResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Rest by the tenants' stove: HP/MP full, fatigue relief, mpRegen buff. */
export function tenantRest(save: PlayerSave, now = Date.now()): StewardRestResult {
  if (!save.housing) {
    return { save, ok: false, message: TENANT_REST_NO_KEY };
  }

  const currentAdena = save.adena ?? 0;
  if (currentAdena < TENANT_REST_COST) {
    return {
      save,
      ok: false,
      message: `Отдых у печи стоит ${TENANT_REST_COST} адены. У тебя: ${currentAdena}.`,
    };
  }

  let nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - TENANT_REST_COST,
    hp: save.maxHp,
    mp: save.maxMp ?? save.mp,
  };

  const restResult = applyRestRecovery(nextSave, now, {
    instantFatigueRelief: TENANT_REST_FATIGUE_RELIEF,
    restMinutes: TENANT_REST_MINUTES,
  });
  if (restResult.ok) {
    nextSave = restResult.save;
  }

  nextSave = applyNamedBuff(nextSave, {
    buffId: TENANT_REST_BUFF_ID,
    buffStat: TENANT_REST_BUFF_STAT,
    buffName: TENANT_REST_BUFF_NAME,
    amount: TENANT_REST_BUFF_AMOUNT,
    durationMs: TENANT_REST_BUFF_DURATION_MS,
  });

  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'TENANT_REST', cost: TENANT_REST_COST },
    timestamp: now,
  });

  const restLine = restResult.ok ? ` ${restResult.message}` : '';
  return {
    save: finalSave,
    ok: true,
    message: `У печи жильцов тепло и тихо. HP и MP полные.${restLine} Получен бафф «${TENANT_REST_BUFF_NAME}». (−${TENANT_REST_COST} адены)`,
  };
}
