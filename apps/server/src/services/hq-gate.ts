/**
 * Haven HQ gate sentry (town_hq_sentry): campus briefing + one-time visitor badge.
 * Access grant (hq_verify_credentials) stays on DialogueService — apply returns null.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';
import { worldEvents } from './world-events.js';

export const HQ_SENTRY_NPC_ID = 'town_hq_sentry';

export const HQ_ACCESS_FLAG = 'quest_empery_hq_access';
export const HQ_BADGE_FLAG = 'haven_hq_badge';
export const HQ_GROVE_COMPLETE_FLAG = 'quest_grove_complete';
export const HQ_DEPTHS_BOSS_COMPLETE_FLAG = 'quest_depths_boss_complete';
export const HQ_ACCESS_MIN_LEVEL = 5;

export const HQ_VISITOR_BADGE_ID = 'hq_visitor_badge';
export const HQ_BADGE_COST = 20;

/** Exact copy of dialogue.ts town_hq_sentry access greeting. */
export const HQ_ACCESS_GREETING =
  'Допуск подтверждён. Ворота открыты — проходи. Не задерживайся у периметра.';

export const HQ_BRIEFING_TEXT =
  'За воротами — кампус EmperyWorld. Главный корпус по оси, лаборатории слева, серверное крыло справа. На крышах антенны периметра: ловят шум Разлома и кормят вышки. К мачтам без жетона не суйся.';

export const HQ_BADGE_NO_ACCESS_MESSAGE =
  'Жетон только для допущенных. Сначала пройди проверку грамот.';
export const HQ_BADGE_ALREADY_MESSAGE = 'Жетон уже выдан. Повторно не штампуем.';

export interface HqGateResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

export function hasHqAccess(save: PlayerSave): boolean {
  return hasFlag(save, HQ_ACCESS_FLAG);
}

/** Same rule as dialogue.ts: grove, depths boss, or level ≥ 5. */
export function isHqGateQualified(save: PlayerSave): boolean {
  return (
    hasFlag(save, HQ_GROVE_COMPLETE_FLAG) ||
    hasFlag(save, HQ_DEPTHS_BOSS_COMPLETE_FLAG) ||
    (save.level ?? 1) >= HQ_ACCESS_MIN_LEVEL
  );
}

export function hasHqVisitorBadge(save: PlayerSave): boolean {
  return hasFlag(save, HQ_BADGE_FLAG);
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

/** Free flavor — campus / lab / antenna. No flag. Repeatable. */
export function hqGateBriefing(save: PlayerSave): HqGateResult {
  return {
    save,
    ok: true,
    message: HQ_BRIEFING_TEXT,
  };
}

/** One-time guest badge: 20 adena, requires quest_empery_hq_access, sets haven_hq_badge. */
export function buyHqVisitorBadge(save: PlayerSave): HqGateResult {
  if (!hasHqAccess(save)) {
    return { save, ok: false, message: HQ_BADGE_NO_ACCESS_MESSAGE };
  }
  if (hasHqVisitorBadge(save)) {
    return { save, ok: false, message: HQ_BADGE_ALREADY_MESSAGE };
  }

  const adena = save.adena ?? 0;
  if (adena < HQ_BADGE_COST) {
    return {
      save,
      ok: false,
      message: `Гостевой жетон стоит ${HQ_BADGE_COST} адены. Без оплаты — без штампа.`,
    };
  }

  const paid: PlayerSave = {
    ...save,
    adena: adena - HQ_BADGE_COST,
    questFlags: {
      ...save.questFlags,
      [HQ_BADGE_FLAG]: true,
    },
  };
  const next = appendItemsToSave(paid, [HQ_VISITOR_BADGE_ID]);
  publish(next, 'HQ_VISITOR_BADGE', { cost: HQ_BADGE_COST });
  return {
    save: next,
    ok: true,
    message: 'Жетон на шею. Камеры периметра узнают гостя — не теряй штамп.',
  };
}
