/**
 * Haven forge extras (Кузнец Гарольд / town_blacksmith):
 * paid edge sharpen + whetstone sale. Armor shop / forge UI stay on the parent.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const SMITH_NPC_ID = 'town_blacksmith';
export const SMITH_WHETSTONE_ITEM = 'smith_whetstone';

export const FORGE_SHARPEN_COST = 15;
export const FORGE_WHETSTONE_COST = 12;

export const SMITH_EDGE_BUFF_ID = 'smith_edge';
export const SMITH_EDGE_BUFF_STAT = 'pAtk' as const;
export const SMITH_EDGE_BUFF_AMOUNT = 8;
export const SMITH_EDGE_BUFF_DURATION_MS = 20 * 60 * 1000;
export const SMITH_EDGE_BUFF_NAME = 'Острая кромка';

export interface SmithSharpenResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
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

export function countSmithWhetstones(save: PlayerSave): number {
  return (save.inventory ?? []).filter((id) => id === SMITH_WHETSTONE_ITEM).length;
}

/** Заточка у горна: 15 адены, бафф «Острая кромка» (+pAtk). Повторно. */
export function smithSharpen(save: PlayerSave): SmithSharpenResult {
  const paid = payOrFail(
    save,
    FORGE_SHARPEN_COST,
    `Заточка стоит ${FORGE_SHARPEN_COST} адены. Без угля и камня кромка не встанет.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const buffed = applyNamedBuff(paid.save, {
    buffId: SMITH_EDGE_BUFF_ID,
    buffStat: SMITH_EDGE_BUFF_STAT,
    buffName: SMITH_EDGE_BUFF_NAME,
    amount: SMITH_EDGE_BUFF_AMOUNT,
    durationMs: SMITH_EDGE_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(buffed);
  publish(finalSave, 'SMITH_SHARPEN', { cost: FORGE_SHARPEN_COST });

  return {
    save: finalSave,
    ok: true,
    message: `Гарольд ведёт камень по кромке, пока сталь не поёт. Получен бафф «${SMITH_EDGE_BUFF_NAME}» (+${SMITH_EDGE_BUFF_AMOUNT} к физ. атаке на 20 мин).`,
  };
}

/** Оселок Гарольда за 12 адены. Повторно. */
export function smithBuyWhetstone(save: PlayerSave): SmithSharpenResult {
  const paid = payOrFail(
    save,
    FORGE_WHETSTONE_COST,
    `Оселок стоит ${FORGE_WHETSTONE_COST} адены. Камень с горна — не подарок.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next = appendItemsToSave(paid.save, [SMITH_WHETSTONE_ITEM]);
  publish(next, 'SMITH_WHETSTONE', { cost: FORGE_WHETSTONE_COST, stones: countSmithWhetstones(next) });
  return {
    save: next,
    ok: true,
    message: 'Гарольд кладёт оселок на стол: правь кромку в поле, когда кузня далеко.',
  };
}
