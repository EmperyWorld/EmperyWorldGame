/**
 * Dialogue plugin for town_hq_sentry (Часовой EmperyWorld).
 * Replicates the inline generate in dialogue.ts, then adds briefing / badge extras.
 * hq_verify_credentials and hq_leave return null so DialogueService keeps the grant.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  filterHavenChoices,
  hasHavenFlag,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import {
  HQ_ACCESS_FLAG,
  HQ_ACCESS_GREETING,
  HQ_BADGE_COST,
  HQ_BADGE_FLAG,
  HQ_SENTRY_NPC_ID,
  buyHqVisitorBadge,
  hasHqAccess,
  hqGateBriefing,
  isHqGateQualified,
  type HqGateResult,
} from './hq-gate.js';

const YAML_FALLTHROUGH_IDS = new Set(['hq_ask_access', 'hq_leave', 'hq_verify_credentials']);

/** Exact copy of dialogue.ts town_hq_sentry verify choice. */
const VERIFY_CHOICE: HavenNpcChoice = {
  id: 'hq_verify_credentials',
  label: 'Проверь мои верительные грамоты.',
  flag: HQ_ACCESS_FLAG,
  portrait: 'serious',
};

/** Exact copy of dialogue.ts access-path leave choice. */
const ACCESS_LEAVE_CHOICE: HavenNpcChoice = {
  id: 'hq_leave',
  label: 'Иду.',
  flag: '_hq_done',
  portrait: 'happy',
};

const BRIEFING_EXTRA: HavenNpcChoice = {
  id: 'hq_briefing',
  label: 'Что за кампус?',
  flag: '_hq_briefing',
  portrait: 'serious',
};

const BADGE_EXTRA: HavenNpcChoice = {
  id: 'hq_badge',
  label: `Гостевой жетон (${HQ_BADGE_COST} адены)`,
  flag: '_hq_badge',
  blocks: [HQ_BADGE_FLAG],
  portrait: 'happy',
};

function yamlOrFallback(npc: HavenNpcLike, fallback: HavenNpcChoice): HavenNpcChoice {
  return npc.choices?.find((choice) => choice.id === fallback.id) ?? fallback;
}

/**
 * Access: hq_leave + extras (briefing always, badge until haven_hq_badge).
 * No access: YAML choices; qualified unshift hq_verify_credentials; extras without badge.
 */
export function hqGateMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  if (hasHqAccess(save)) {
    const ordered: HavenNpcChoice[] = [
      ACCESS_LEAVE_CHOICE,
      yamlOrFallback(npc, BRIEFING_EXTRA),
    ];
    if (!hasHavenFlag(save, HQ_BADGE_FLAG)) {
      ordered.push(BADGE_EXTRA);
    }
    return filterHavenChoices(ordered, save);
  }

  const yamlOrdered: HavenNpcChoice[] = [...(npc.choices ?? [])];
  if (!yamlOrdered.some((choice) => choice.id === BRIEFING_EXTRA.id)) {
    const leaveIdx = yamlOrdered.findIndex((choice) => choice.id === 'hq_leave');
    if (leaveIdx >= 0) {
      yamlOrdered.splice(leaveIdx, 0, BRIEFING_EXTRA);
    } else {
      yamlOrdered.push(BRIEFING_EXTRA);
    }
  }

  if (isHqGateQualified(save)) {
    yamlOrdered.unshift(VERIFY_CHOICE);
  }

  return filterHavenChoices(yamlOrdered, save);
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: HqGateResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, hqGateMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateHqGateDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== HQ_SENTRY_NPC_ID) return null;

  if (hasHqAccess(save)) {
    return withDialogueScene(npc, {
      text: HQ_ACCESS_GREETING,
      choices: mapDialogueChoices(npc, hqGateMenuChoices(npc, save)),
      portrait: 'happy',
    });
  }

  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, hqGateMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

export function applyHqGateChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== HQ_SENTRY_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'hq_briefing') {
    return followUpFromResult(npc, hqGateBriefing(save), 'serious');
  }
  if (choiceId === 'hq_badge') {
    return followUpFromResult(npc, buyHqVisitorBadge(save), 'happy');
  }

  return null;
}

export const hqGatePlugin: HavenNpcFeaturePlugin = {
  generate: generateHqGateDialogue,
  apply: applyHqGateChoice,
};
