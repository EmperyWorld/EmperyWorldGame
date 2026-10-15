/**
 * Haven city guard (Страж Леон / town_guard):
 * municipal karma fine (partial, cheaper than cathedral) + one-time watch report.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const TOWN_GUARD_NPC_ID = 'town_guard';

export const GUARD_FINE_COST = 30;
export const GUARD_FINE_KARMA_CUT = 25;

export const GUARD_REPORT_ACTIVE_FLAG = 'quest_guard_report_active';
export const GUARD_REPORT_COMPLETE_FLAG = 'quest_guard_report_complete';
export const GUARD_REPORT_REWARD_ADENA = 40;

export const GUARD_WATCH_BUFF_ID = 'guard_watch';
export const GUARD_WATCH_BUFF_STAT = 'accuracy' as const;
export const GUARD_WATCH_BUFF_NAME = 'Глаз дозора';
export const GUARD_WATCH_BUFF_AMOUNT = 8;
export const GUARD_WATCH_BUFF_DURATION_MS = 15 * 60 * 1000;

/** HUD line for the integrator (`quest-hud.ts` — not wired here). */
export const GUARD_REPORT_HUD = 'Квест: доложи стражу Леону у ворот [E]';

export interface GuardWatchResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function playerKarma(save: PlayerSave): number {
  return save.karma ?? 0;
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

/**
 * City fine: 30 adena, cut karma by min(karma, 25), never below 0.
 * Distinct from cathedral confess (full clear, 50 adena).
 */
export function payCityFine(save: PlayerSave): GuardWatchResult {
  const karma = playerKarma(save);
  if (karma <= 0) {
    return {
      save,
      ok: false,
      message: 'Кармы греха нет — штраф не за что',
    };
  }

  const currentAdena = save.adena ?? 0;
  if (currentAdena < GUARD_FINE_COST) {
    return {
      save,
      ok: false,
      message: `Городской штраф — ${GUARD_FINE_COST} адены. У тебя: ${currentAdena}.`,
    };
  }

  const cut = Math.min(karma, GUARD_FINE_KARMA_CUT);
  const nextKarma = Math.max(0, karma - cut);
  const next: PlayerSave = {
    ...save,
    adena: currentAdena - GUARD_FINE_COST,
    karma: nextKarma,
  };

  publish(next, 'CITY_FINE', { cost: GUARD_FINE_COST, karmaCut: cut, karmaAfter: nextKarma });
  return {
    save: next,
    ok: true,
    message: `Штраф принят (${GUARD_FINE_COST} адены). Карма снижена на ${cut} (${karma} → ${nextKarma}). Полное отпущение — у отца Кассия.`,
  };
}

/** One-time watch report: sets quest_guard_report_active. */
export function acceptWatchReport(save: PlayerSave): GuardWatchResult {
  if (hasFlag(save, GUARD_REPORT_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Рапорт уже закрыт. Дозор без тебя не встанет, но расчёт был.',
    };
  }
  if (hasFlag(save, GUARD_REPORT_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: 'Рапорт уже у тебя. Обойди ворота и доложи мне.',
    };
  }

  const next: PlayerSave = {
    ...save,
    questFlags: {
      ...save.questFlags,
      [GUARD_REPORT_ACTIVE_FLAG]: true,
    },
  };
  return {
    save: next,
    ok: true,
    message: 'Дозорный рапорт открыт. Обойди ворота и доложи мне у стражи.',
  };
}

/**
 * Claim the open report: 40 adena, complete lock, accuracy buff 8 / 15 min.
 * Double claim fails.
 */
export function claimGuardReport(save: PlayerSave): GuardWatchResult {
  if (hasFlag(save, GUARD_REPORT_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Рапорт уже сдан. Второй раз платить не буду.',
    };
  }
  if (!hasFlag(save, GUARD_REPORT_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала возьми рапорт — иначе нечего докладывать.',
    };
  }

  const nextFlags: Record<string, string | number | boolean> = {
    ...save.questFlags,
    [GUARD_REPORT_COMPLETE_FLAG]: true,
  };
  delete nextFlags[GUARD_REPORT_ACTIVE_FLAG];

  let next: PlayerSave = {
    ...save,
    adena: (save.adena ?? 0) + GUARD_REPORT_REWARD_ADENA,
    questFlags: nextFlags,
  };
  next = applyNamedBuff(next, {
    buffId: GUARD_WATCH_BUFF_ID,
    buffStat: GUARD_WATCH_BUFF_STAT,
    buffName: GUARD_WATCH_BUFF_NAME,
    amount: GUARD_WATCH_BUFF_AMOUNT,
    durationMs: GUARD_WATCH_BUFF_DURATION_MS,
  });
  next = applyStatsToSave(next);

  publish(next, 'GUARD_REPORT_COMPLETE', { rewardAdena: GUARD_REPORT_REWARD_ADENA });
  return {
    save: next,
    ok: true,
    message: `Дозор принят. Держи ${GUARD_REPORT_REWARD_ADENA} адены и «${GUARD_WATCH_BUFF_NAME}» — глаз на 15 минут острее.`,
  };
}
