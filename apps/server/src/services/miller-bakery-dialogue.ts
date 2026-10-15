/**
 * Dialogue plugin for town_miller (Мельник Фаддей).
 * DialogueService wires generateMillerDialogue / applyMillerChoice.
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
  MILLER_ORDER_ACTIVE_FLAG,
  MILLER_ORDER_COMPLETE_FLAG,
  acceptMillerOrder,
  claimMillerOrder,
  millerBakeBread,
  millerMillGrain,
  type MillerBakeryResult,
} from './miller-bakery.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'miller_grain',
  'miller_storm',
  'miller_leave',
  'miller_grain_bye',
  'miller_storm_bye',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  { id: 'miller_mill', label: 'Смолоть зерно', flag: '_miller_mill', portrait: 'work' },
  { id: 'miller_bake', label: 'Испечь хлеб', flag: '_miller_bake', portrait: 'happy' },
  {
    id: 'miller_order_accept',
    label: 'Взять заказ на муку',
    flag: '_miller_order_accept',
    blocks: [MILLER_ORDER_ACTIVE_FLAG, MILLER_ORDER_COMPLETE_FLAG],
    portrait: 'serious',
  },
  {
    id: 'miller_order_claim',
    label: 'Отдать три мешка муки',
    flag: '_miller_order_claim',
    portrait: 'work',
  },
];

const MENU_ORDER = [
  'miller_shop',
  'miller_mill',
  'miller_bake',
  'miller_order_accept',
  'miller_order_claim',
  'miller_grain',
  'miller_storm',
  'miller_leave',
];

function isMillerQuestChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'miller_order_accept') {
    return (
      !hasHavenFlag(save, MILLER_ORDER_ACTIVE_FLAG) &&
      !hasHavenFlag(save, MILLER_ORDER_COMPLETE_FLAG)
    );
  }
  if (choice.id === 'miller_order_claim') {
    return (
      hasHavenFlag(save, MILLER_ORDER_ACTIVE_FLAG) &&
      !hasHavenFlag(save, MILLER_ORDER_COMPLETE_FLAG)
    );
  }
  return true;
}

export function millerMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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
    isMillerQuestChoiceVisible(choice, save),
  );
}

function millerGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (hasHavenFlag(save, MILLER_ORDER_COMPLETE_FLAG)) {
    return {
      text: 'Заказ закрыт. Жернова крутятся — зерно в муку, мука в хлеб. Бери каравай, если голод не спит.',
      portrait: 'happy',
    };
  }
  if (hasHavenFlag(save, MILLER_ORDER_ACTIVE_FLAG)) {
    return {
      text: 'Нужно три мешка муки. Принеси помол — рассчитаюсь. Зерно в лавке, жернова здесь.',
      portrait: 'serious',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

export function generateMillerDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== 'town_miller') return null;
  const greeting = millerGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, millerMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: MillerBakeryResult,
  portrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, millerMenuChoices(npc, result.save)),
      portrait: result.ok ? portrait : 'serious',
    }),
  };
}

export function applyMillerChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== 'town_miller') return null;

  if (choiceId === 'miller_shop') {
    return { save };
  }

  if (choiceId === 'miller_mill') {
    return followUpFromResult(npc, millerMillGrain(save), 'work');
  }
  if (choiceId === 'miller_bake') {
    return followUpFromResult(npc, millerBakeBread(save), 'happy');
  }
  if (choiceId === 'miller_order_accept') {
    return followUpFromResult(npc, acceptMillerOrder(save), 'serious');
  }
  if (choiceId === 'miller_order_claim') {
    return followUpFromResult(npc, claimMillerOrder(save), 'happy');
  }

  if (YAML_FALLTHROUGH_IDS.has(choiceId)) return null;

  return { save };
}
