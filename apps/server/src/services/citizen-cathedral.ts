/**
 * Haven cathedral pilgrim loop (Паломник Гавани / haven_citizen_cathedral):
 * prayer ribbon sale + repeatable alms buff. Priest votive stays on town_priest.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const CATHEDRAL_CITIZEN_NPC_ID = 'haven_citizen_cathedral';

export const PRAYER_RIBBON_ITEM = 'prayer_ribbon';
export const CATHEDRAL_RIBBON_COST = 7;
export const CATHEDRAL_ALMS_COST = 10;

export const PILGRIM_ALMS_BUFF_ID = 'pilgrim_alms';
export const PILGRIM_ALMS_BUFF_STAT = 'mDef' as const;
export const PILGRIM_ALMS_BUFF_AMOUNT = 5;
export const PILGRIM_ALMS_BUFF_DURATION_MS = 15 * 60 * 1000;
export const PILGRIM_ALMS_BUFF_NAME = 'Лента паломника';

export interface CitizenCathedralResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export function countPrayerRibbons(save: PlayerSave): number {
  return (save.inventory ?? []).filter((id) => id === PRAYER_RIBBON_ITEM).length;
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

/** Молитвенная лента: 7 адены, предмет prayer_ribbon. Повтор разрешён. */
export function buyPrayerRibbon(save: PlayerSave): CitizenCathedralResult {
  const paid = payOrFail(
    save,
    CATHEDRAL_RIBBON_COST,
    `Молитвенная лента стоит ${CATHEDRAL_RIBBON_COST} адены. Без монеты паломник не отдаст ткань.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next = appendItemsToSave(paid.save, [PRAYER_RIBBON_ITEM]);
  publish(next, 'CATHEDRAL_RIBBON', {
    cost: CATHEDRAL_RIBBON_COST,
    ribbons: countPrayerRibbons(next),
  });
  return {
    save: next,
    ok: true,
    message: 'Паломник кладёт тонкую ленту на ладонь: молитва в пути. Держи.',
  };
}

/** Милостыня паломнику: 10 адены, бафф «Лента паломника» (mDef). Повтор разрешён. */
export function givePilgrimAlms(save: PlayerSave): CitizenCathedralResult {
  const paid = payOrFail(
    save,
    CATHEDRAL_ALMS_COST,
    `Милостыня — ${CATHEDRAL_ALMS_COST} адены. Пустая ладонь не держит благословение.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const buffed = applyNamedBuff(paid.save, {
    buffId: PILGRIM_ALMS_BUFF_ID,
    buffStat: PILGRIM_ALMS_BUFF_STAT,
    buffName: PILGRIM_ALMS_BUFF_NAME,
    amount: PILGRIM_ALMS_BUFF_AMOUNT,
    durationMs: PILGRIM_ALMS_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(buffed);
  publish(finalSave, 'CATHEDRAL_PILGRIM_ALMS', { cost: CATHEDRAL_ALMS_COST });

  return {
    save: finalSave,
    ok: true,
    message: `Паломник принимает милостыню и повязывает ленту. Получен бафф «${PILGRIM_ALMS_BUFF_NAME}» (+${PILGRIM_ALMS_BUFF_AMOUNT} к маг. защите на 15 мин).`,
  };
}
