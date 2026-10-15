/**
 * Пивовар Хольм (town_brewer): дегустация эля и тост за Гавань.
 * Dialogue wiring lives in brewery-tasting-dialogue.ts — do not add logic to dialogue.ts from here.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const HOLM_TASTE_COST = 8;
export const HOLM_TOAST_COST = 20;
export const HOLM_TASTE_THRESHOLD = 3;
export const HOLM_STOUT_ITEM_ID = 'holm_stout';

export const HOLM_TASTE_BUFF_ID = 'holm_taste';
export const HOLM_TOAST_BUFF_ID = 'holm_toast';

export const HAVEN_BREW_TASTINGS_FLAG = 'haven_brew_tastings';
export const HAVEN_BREW_TOAST_CLAIMED_FLAG = 'haven_brew_toast_claimed';

export interface BreweryTastingResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export function brewTastingCount(save: PlayerSave): number {
  return Number(save.questFlags[HAVEN_BREW_TASTINGS_FLAG] ?? 0) || 0;
}

export function isHolmToastFree(save: PlayerSave): boolean {
  return brewTastingCount(save) >= HOLM_TASTE_THRESHOLD && !save.questFlags[HAVEN_BREW_TOAST_CLAIMED_FLAG];
}

export function holmToastCost(save: PlayerSave): number {
  return isHolmToastFree(save) ? 0 : HOLM_TOAST_COST;
}

/** Дегустация фирменного эля: +critRate («Хмельной задор»), 8 адены. */
export function tasteHolmAle(save: PlayerSave): BreweryTastingResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < HOLM_TASTE_COST) {
    return {
      save,
      ok: false,
      message: `Дегустация стоит ${HOLM_TASTE_COST} адены. Без звона в кармане хмель не откроется.`,
    };
  }

  let nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - HOLM_TASTE_COST,
    questFlags: {
      ...save.questFlags,
      [HAVEN_BREW_TASTINGS_FLAG]: brewTastingCount(save) + 1,
    },
  };

  nextSave = applyNamedBuff(nextSave, {
    buffId: HOLM_TASTE_BUFF_ID,
    buffStat: 'critRate',
    buffName: 'Хмельной задор',
    amount: 8,
    durationMs: 20 * 60 * 1000,
  });

  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'HOLM_TASTE', cost: HOLM_TASTE_COST },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message:
      'Хольм наливает пробную кружку: горечь, дым и янтарь. Получен бафф «Хмельной задор» (+8 к шансу крита на 20 мин).',
  };
}

/**
 * Тост за Гавань: кружка `holm_stout` + бафф «Тост за Гавань» (mDef).
 * Первая кружка бесплатна после 3 дегустаций; иначе 20 адены всегда.
 */
export function buyHolmToast(save: PlayerSave): BreweryTastingResult {
  const free = isHolmToastFree(save);
  const cost = free ? 0 : HOLM_TOAST_COST;
  const currentAdena = save.adena ?? 0;
  if (currentAdena < cost) {
    return {
      save,
      ok: false,
      message: `Тост за Гавань стоит ${HOLM_TOAST_COST} адены — либо три дегустации, и первая кружка в дар.`,
    };
  }

  let nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - cost,
    questFlags: {
      ...save.questFlags,
      ...(free ? { [HAVEN_BREW_TOAST_CLAIMED_FLAG]: true } : {}),
    },
  };

  nextSave = appendItemsToSave(nextSave, [HOLM_STOUT_ITEM_ID]);
  nextSave = applyNamedBuff(nextSave, {
    buffId: HOLM_TOAST_BUFF_ID,
    buffStat: 'mDef',
    buffName: 'Тост за Гавань',
    amount: 10,
    durationMs: 15 * 60 * 1000,
  });

  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'HOLM_TOAST', cost, free },
    timestamp: Date.now(),
  });

  const costNote = free
    ? 'Первый тост — в дар за три дегустации.'
    : `С кружки снято ${cost} адены.`;
  return {
    save: finalSave,
    ok: true,
    message: `Хольм поднимает кружку стаута: «За Гавань!» ${costNote} Получен бафф «Тост за Гавань» (+10 маг. защиты на 15 мин) и «Стаут Хольма».`,
  };
}
