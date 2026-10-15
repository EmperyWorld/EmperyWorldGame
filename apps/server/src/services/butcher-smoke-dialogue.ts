/**
 * Dialogue plugin for town_butcher (Мясник Бран).
 * DialogueService wires generateButcherDialogue / applyButcherChoice.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import {
  filterHavenChoices,
  hasHavenFlag,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  BUTCHER_JERKY_ACTIVE_FLAG,
  BUTCHER_JERKY_COMPLETE_FLAG,
  butcherOrderJerky,
  butcherSmokeMeat,
  claimButcherJerky,
  type ButcherSmokeResult,
} from './butcher-smoke.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'butcher_tip',
  'butcher_leave',
  'butcher_tip_bye',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  { id: 'butcher_smoke', label: 'Коптить мясо', flag: '_butcher_smoke', portrait: 'work' },
  {
    id: 'butcher_jerky_accept',
    label: 'Взять заказ на сырое мясо',
    flag: '_butcher_jerky_accept',
    blocks: [BUTCHER_JERKY_ACTIVE_FLAG, BUTCHER_JERKY_COMPLETE_FLAG],
    portrait: 'serious',
  },
  {
    id: 'butcher_jerky_claim',
    label: 'Отдать два куска сырого мяса',
    flag: '_butcher_jerky_claim',
    portrait: 'work',
  },
];

const MENU_ORDER = [
  'butcher_shop',
  'butcher_smoke',
  'butcher_jerky_accept',
  'butcher_jerky_claim',
  'butcher_tip',
  'butcher_leave',
];

function isButcherQuestChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'butcher_jerky_accept') {
    return (
      !hasHavenFlag(save, BUTCHER_JERKY_ACTIVE_FLAG) &&
      !hasHavenFlag(save, BUTCHER_JERKY_COMPLETE_FLAG)
    );
  }
  if (choice.id === 'butcher_jerky_claim') {
    return (
      hasHavenFlag(save, BUTCHER_JERKY_ACTIVE_FLAG) &&
      !hasHavenFlag(save, BUTCHER_JERKY_COMPLETE_FLAG)
    );
  }
  return true;
}

export function butcherMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter((choice) =>
    isButcherQuestChoiceVisible(choice, save),
  );
}

function butcherGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (hasHavenFlag(save, BUTCHER_JERKY_COMPLETE_FLAG)) {
    return {
      text: 'Заказ закрыт. Коптильня дымит — бери мясо, если голод не спит.',
      portrait: 'happy',
    };
  }
  if (hasHavenFlag(save, BUTCHER_JERKY_ACTIVE_FLAG)) {
    return {
      text: 'Нужно два сырых. Принеси — рассчитаюсь. Сырое у прилавка или с охоты.',
      portrait: 'serious',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

export function generateButcherDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== 'town_butcher') return null;
  const greeting = butcherGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, butcherMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: ButcherSmokeResult,
  portrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, butcherMenuChoices(npc, result.save)),
      portrait: result.ok ? portrait : 'serious',
    }),
  };
}

export function applyButcherChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== 'town_butcher') return null;

  if (choiceId === 'butcher_shop') {
    return { save };
  }

  if (choiceId === 'butcher_smoke') {
    return followUpFromResult(npc, butcherSmokeMeat(save), 'work');
  }
  if (choiceId === 'butcher_jerky_accept') {
    return followUpFromResult(npc, butcherOrderJerky(save), 'serious');
  }
  if (choiceId === 'butcher_jerky_claim') {
    return followUpFromResult(npc, claimButcherJerky(save), 'happy');
  }

  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  return { save };
}
