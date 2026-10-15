/**
 * Dialogue plugin for town_guard (Страж Леон).
 * DialogueService wires generateGuardDialogue / applyGuardChoice.
 * Greeting copied from the inline town_guard block in dialogue.ts so parent can replace it.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import {
  filterHavenChoices,
  hasHavenFlag,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  GUARD_REPORT_ACTIVE_FLAG,
  GUARD_REPORT_COMPLETE_FLAG,
  TOWN_GUARD_NPC_ID,
  acceptWatchReport,
  claimGuardReport,
  payCityFine,
  type GuardWatchResult,
} from './guard-watch.js';

/** Exact copy of dialogue.ts town_guard PK greeting. */
export const GUARD_KARMA_THREAT_TEXT =
  'Стой! Я чую невинную кровь на твоих руках. В Гавани действуют законы, нарушитель. Один неверный шаг — и окажешься в темнице.';

/** Exact copy of dialogue.ts town_guard bounty-complete greeting. */
export const GUARD_BOUNTY_WELCOME_TEXT =
  'Приветствую, герой! Дозор докладывает, что за стенами стало спокойнее благодаря твоим вылазкам. Гавань помнит своих защитников.';

const YAML_FALLTHROUGH_IDS = new Set([
  'guard_rules',
  'guard_trouble',
  'guard_leave',
  'guard_rules_bye',
  'guard_trouble_bye',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'guard_fine',
    label: 'Заплатить городской штраф (30 адены)',
    flag: '_guard_fine',
    portrait: 'serious',
  },
  {
    id: 'guard_report_accept',
    label: 'Взять дозорный рапорт',
    flag: '_guard_report_accept',
    blocks: [GUARD_REPORT_ACTIVE_FLAG, GUARD_REPORT_COMPLETE_FLAG],
    portrait: 'serious',
  },
  {
    id: 'guard_report_claim',
    label: 'Доложить о дозоре',
    flag: '_guard_report_claim',
    portrait: 'happy',
  },
];

const MENU_ORDER = [
  'guard_fine',
  'guard_report_accept',
  'guard_report_claim',
  'guard_rules',
  'guard_trouble',
  'guard_leave',
];

function isGuardChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'guard_fine') {
    return (save.karma ?? 0) > 0;
  }
  if (choice.id === 'guard_report_accept') {
    return (
      !hasHavenFlag(save, GUARD_REPORT_ACTIVE_FLAG) &&
      !hasHavenFlag(save, GUARD_REPORT_COMPLETE_FLAG)
    );
  }
  if (choice.id === 'guard_report_claim') {
    return hasHavenFlag(save, GUARD_REPORT_ACTIVE_FLAG);
  }
  return true;
}

export function guardMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  for (const extra of MECHANIC_EXTRAS) {
    if (!byId.has(extra.id)) byId.set(extra.id, extra);
  }

  const ordered: HavenNpcChoice[] = [];
  for (const id of MENU_ORDER) {
    const choice = byId.get(id);
    if (choice) {
      ordered.push(choice);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());

  return filterHavenChoices(ordered, save).filter((choice) => isGuardChoiceVisible(choice, save));
}

/**
 * L2-style: karma > 0 is chaotic / PK (see PlayerSave).
 * Citizen recognition follows the same sign convention.
 */
function guardGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  let text = npc.defaultGreeting;
  if ((save.karma ?? 0) > 0) {
    text = GUARD_KARMA_THREAT_TEXT;
  } else if (save.questFlags.quest_board_bounty_complete) {
    text = GUARD_BOUNTY_WELCOME_TEXT;
  }
  const portrait =
    (save.karma ?? 0) > 0
      ? 'serious'
      : save.questFlags.quest_board_bounty_complete
        ? 'happy'
        : 'neutral';
  return { text, portrait };
}

export function generateGuardDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== TOWN_GUARD_NPC_ID) return null;
  const greeting = guardGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, guardMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: GuardWatchResult,
  portrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, guardMenuChoices(npc, result.save)),
      portrait: result.ok ? portrait : 'serious',
    }),
  };
}

export function applyGuardChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== TOWN_GUARD_NPC_ID) return null;

  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'guard_fine') {
    return followUpFromResult(npc, payCityFine(save), 'serious');
  }
  if (choiceId === 'guard_report_accept') {
    return followUpFromResult(npc, acceptWatchReport(save), 'serious');
  }
  if (choiceId === 'guard_report_claim') {
    return followUpFromResult(npc, claimGuardReport(save), 'happy');
  }

  return null;
}

export const guardWatchPlugin: HavenNpcFeaturePlugin = {
  generate: generateGuardDialogue,
  apply: (npc, save, choiceId) => applyGuardChoice(save, npc, choiceId),
};
