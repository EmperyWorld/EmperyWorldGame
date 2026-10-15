/**
 * Haven field clinic — Лекарь Сера (town_healer):
 * kit sale, long rest-care, read-only diagnosis.
 * Shop/treat stay on the parent (client apothecary / treatAtNpc).
 */
import { hasSurvivalInjury, type PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { listActiveConditionHints, treatAtNpc } from './medical.js';
import { applyStatsToSave } from './stats.js';
import { applyRestRecovery, survivalOf } from './survival.js';
import { worldEvents } from './world-events.js';

export const HEALER_NPC_ID = 'town_healer';
export const HEALER_KIT_COST = 20;
export const HEALER_LONG_COST = 60;
export const HEALER_TREAT_COST = 45;

export const SERA_BANDAGE_ID = 'sera_bandage';

export const SERA_CARE_BUFF_ID = 'sera_care';
export const SERA_CARE_BUFF_STAT = 'mDef' as const;
export const SERA_CARE_BUFF_AMOUNT = 8;
export const SERA_CARE_BUFF_DURATION_MS = 20 * 60 * 1000;
export const SERA_CARE_BUFF_NAME = 'Спокойный пульс';

export const HEALER_DIAGNOSE_CLEAR = 'Ран и хворей не вижу';
export const HEALER_DIAGNOSE_DOOM =
  'Пока травма не снята, вне города повторный обморок или смерть в бою — Гибель.';

export interface HealerClinicResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export function countSeraBandages(save: PlayerSave): number {
  return (save.inventory ?? []).filter((id) => id === SERA_BANDAGE_ID).length;
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

/** Wrapper over treatAtNpc — apply() still returns null so DialogueService keeps healer_treat. */
export function healerTreat(save: PlayerSave): HealerClinicResult {
  const result = treatAtNpc(save, HEALER_NPC_ID, survivalOf(save));
  return { save: result.save, ok: result.ok, message: result.message };
}

/** Полевой бинт Серы за 20 адены. 3+ в сумке — всё равно продаём. */
export function healerFieldKit(save: PlayerSave): HealerClinicResult {
  const paid = payOrFail(
    save,
    HEALER_KIT_COST,
    `Полевой бинт стоит ${HEALER_KIT_COST} адены. Травы и полотно — не дар.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next = appendItemsToSave(paid.save, [SERA_BANDAGE_ID]);
  publish(next, 'HEALER_FIELD_KIT', { cost: HEALER_KIT_COST, kits: countSeraBandages(next) });
  const alreadyMany = countSeraBandages(save) >= 3;
  return {
    save: next,
    ok: true,
    message: alreadyMany
      ? 'Ещё один бинт — в поле не лишний. Сера протягивает свёрток.'
      : 'Сера протягивает свёрток: полевой бинт. В дороге — сразу на рану, не жди Гавани.',
  };
}

/** Долгий уход: 60 адены, полное HP/MP, снятие усталости, бафф «Спокойный пульс». */
export function healerLongCare(save: PlayerSave): HealerClinicResult {
  const paid = payOrFail(
    save,
    HEALER_LONG_COST,
    `Долгий уход стоит ${HEALER_LONG_COST} адены. Покой и пульс не дешевле иглы.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  let next: PlayerSave = {
    ...paid.save,
    hp: paid.save.maxHp,
    mp: paid.save.maxMp ?? paid.save.mp,
  };

  const rest = applyRestRecovery(next, Date.now(), {
    instantFatigueRelief: 40,
    restMinutes: 20,
  });
  if (rest.ok) {
    next = rest.save;
  }

  next = applyNamedBuff(next, {
    buffId: SERA_CARE_BUFF_ID,
    buffStat: SERA_CARE_BUFF_STAT,
    buffName: SERA_CARE_BUFF_NAME,
    amount: SERA_CARE_BUFF_AMOUNT,
    durationMs: SERA_CARE_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(next);
  publish(finalSave, 'HEALER_LONG_CARE', { cost: HEALER_LONG_COST });

  return {
    save: finalSave,
    ok: true,
    message: `Сера держит руку на запястье, пока дыхание ровняется. Здоровье и сила полные. Получен бафф «${SERA_CARE_BUFF_NAME}» (+${SERA_CARE_BUFF_AMOUNT} к маг. защите на 20 мин).`,
  };
}

/** Осмотр без платы: список хворей или «Ран и хворей не вижу». */
export function healerDiagnose(save: PlayerSave): HealerClinicResult {
  const state = survivalOf(save);
  const hints = listActiveConditionHints(state.conditions);
  if (hints.length === 0) {
    return { save, ok: true, message: HEALER_DIAGNOSE_CLEAR };
  }
  const doomNote = hasSurvivalInjury(state.conditions) ? ` ${HEALER_DIAGNOSE_DOOM}` : '';
  return {
    save,
    ok: true,
    message: `Сера смотрит на раны: ${hints.join('; ')}.${doomNote}`,
  };
}
