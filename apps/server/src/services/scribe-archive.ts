/**
 * Haven municipal archive — scribe Irina (town_scribe):
 * travel writ copies, paid archive search, port folio claim, accuracy clarity buff.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const SCRIBE_WRIT_COST = 20;
export const SCRIBE_SEARCH_COST = 12;
export const SCRIBE_CLARITY_COST = 10;

export const TRAVEL_WRIT_ID = 'scribe_travel_writ';
export const PORT_FOLIO_ID = 'scribe_port_folio';

export const SCRIBE_FOLIO_ACTIVE_FLAG = 'quest_scribe_folio_active';
export const SCRIBE_FOLIO_COMPLETE_FLAG = 'quest_scribe_folio_complete';

export const SCRIBE_CLARITY_BUFF_ID = 'scribe_clarity';
export const SCRIBE_CLARITY_BUFF_NAME = 'Ясность архива';
export const SCRIBE_CLARITY_AMOUNT = 12;
export const SCRIBE_CLARITY_DURATION_MS = 25 * 60 * 1000;

/** HUD line for the integrator (`quest-hud.ts` — not wired here). */
export const SCRIBE_FOLIO_HUD = 'Квест: забери опись у писца Ирины [E]';

export interface ScribeArchiveResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function hasItem(save: PlayerSave, itemId: string): boolean {
  return (save.inventory ?? []).includes(itemId);
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

function applyClarityBuff(save: PlayerSave): PlayerSave {
  const buffed = applyNamedBuff(save, {
    buffId: SCRIBE_CLARITY_BUFF_ID,
    buffStat: 'accuracy',
    buffName: SCRIBE_CLARITY_BUFF_NAME,
    amount: SCRIBE_CLARITY_AMOUNT,
    durationMs: SCRIBE_CLARITY_DURATION_MS,
  });
  return applyStatsToSave(buffed);
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

/** Копия путевой грамоты с печатью скриптория. */
export function copyTravelWrit(save: PlayerSave): ScribeArchiveResult {
  if (hasItem(save, TRAVEL_WRIT_ID)) {
    return { save, ok: false, message: 'Грамота уже у тебя' };
  }

  const paid = payOrFail(
    save,
    SCRIBE_WRIT_COST,
    `Копия грамоты стоит ${SCRIBE_WRIT_COST} адены. Чернила и печать не даром.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next = appendItemsToSave(paid.save, [TRAVEL_WRIT_ID]);
  publish(next, 'SCRIBE_COPY_WRIT', { cost: SCRIBE_WRIT_COST });
  return {
    save: next,
    ok: true,
    message:
      'Ирина ставит печать скриптория: «Путевая грамота Гавани. Ворота узнают герб — не мни углы.»',
  };
}

/** Платный поиск описи в архиве. Выдача — отдельно, через claimArchiveFolio. */
export function startArchiveSearch(save: PlayerSave): ScribeArchiveResult {
  if (hasFlag(save, SCRIBE_FOLIO_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Опись причалов уже выдана. Архив не дублирует закрытые дела.',
    };
  }
  if (hasFlag(save, SCRIBE_FOLIO_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: 'Поиск уже идёт. Забери опись, пока полки не смешали.',
    };
  }

  const paid = payOrFail(
    save,
    SCRIBE_SEARCH_COST,
    `Поиск в архиве стоит ${SCRIBE_SEARCH_COST} адены. Свечи и пыль не бесплатны.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next: PlayerSave = {
    ...paid.save,
    questFlags: {
      ...paid.save.questFlags,
      [SCRIBE_FOLIO_ACTIVE_FLAG]: true,
    },
  };
  publish(next, 'SCRIBE_ARCHIVE_SEARCH', { cost: SCRIBE_SEARCH_COST });
  return {
    save: next,
    ok: true,
    message:
      'Ирина кивает к стеллажам: «Ищу опись причалов. Подожди у стола — и забери, когда скажу.»',
  };
}

/** Выдача описи после оплаченного поиска + бафф ясности (награда, без второй платы). */
export function claimArchiveFolio(save: PlayerSave): ScribeArchiveResult {
  if (hasFlag(save, SCRIBE_FOLIO_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Опись уже у тебя. Второй раз свиток не переписываю.',
    };
  }
  if (!hasFlag(save, SCRIBE_FOLIO_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала закажи поиск в архиве — иначе нечего выдавать.',
    };
  }

  const withFolio = appendItemsToSave(save, [PORT_FOLIO_ID]);
  const nextFlags: Record<string, string | number | boolean> = {
    ...withFolio.questFlags,
    [SCRIBE_FOLIO_COMPLETE_FLAG]: true,
  };
  delete nextFlags[SCRIBE_FOLIO_ACTIVE_FLAG];

  const next = applyClarityBuff({
    ...withFolio,
    questFlags: nextFlags,
  });

  publish(next, 'SCRIBE_CLAIM_FOLIO');
  return {
    save: next,
    ok: true,
    message:
      'Ирина протягивает свиток: «Опись причалов. И строки сегодня ровные — глаз не собьётся.» Получена «Ясность архива».',
  };
}

/** Платная ясность архива: +accuracy на 25 мин. */
export function requestArchiveClarity(save: PlayerSave): ScribeArchiveResult {
  const paid = payOrFail(
    save,
    SCRIBE_CLARITY_COST,
    `Ясность архива стоит ${SCRIBE_CLARITY_COST} адены. Свежий раствор чернил — не вода.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const next = applyClarityBuff(paid.save);
  publish(next, 'SCRIBE_CLARITY', { cost: SCRIBE_CLARITY_COST });
  return {
    save: next,
    ok: true,
    message:
      'Ирина правит взгляд по линейке строк: получена «Ясность архива» (+12 к меткости на 25 мин).',
  };
}
