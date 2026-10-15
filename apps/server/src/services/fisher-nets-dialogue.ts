/**
 * Dialogue plugin for town_fisher (Рыбак Ульф).
 * Mechanic: fisher_bait / fisher_nets. Fish delivery + shop + YAML flavor fall through.
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
  FISH_QUEST_ACTIVE_FLAG,
  FISH_QUEST_COMPLETE_FLAG,
  FISH_QUEST_DELIVERED_FLAG,
} from './haven-services.js';
import {
  TOWN_FISHER_NPC_ID,
  ULF_NETS_COMPLETE_FLAG,
  fisherBuyBait,
  fisherMendNets,
  type FisherNetsResult,
} from './fisher-nets.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'fisher_quest_start',
  'fisher_quest_claim',
  'fisher_shop',
  'fisher_catch',
  'fisher_tide',
  'fisher_leave',
  'fisher_catch_bye',
  'fisher_tide_bye',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'fisher_bait',
    label: 'Купить наживку (6 адены)',
    flag: '_fisher_bait',
    portrait: 'work',
  },
  {
    id: 'fisher_nets',
    label: 'Помочь чинить сети',
    flag: '_fisher_nets',
    blocks: [ULF_NETS_COMPLETE_FLAG],
    portrait: 'work',
  },
];

const MENU_ORDER = [
  'fisher_quest_start',
  'fisher_quest_claim',
  'fisher_shop',
  'fisher_bait',
  'fisher_nets',
  'fisher_catch',
  'fisher_tide',
  'fisher_leave',
];

function isFisherChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'fisher_quest_start') {
    return (
      !hasHavenFlag(save, FISH_QUEST_COMPLETE_FLAG) && !hasHavenFlag(save, FISH_QUEST_ACTIVE_FLAG)
    );
  }
  if (choice.id === 'fisher_quest_claim') {
    return (
      hasHavenFlag(save, FISH_QUEST_DELIVERED_FLAG) && !hasHavenFlag(save, FISH_QUEST_COMPLETE_FLAG)
    );
  }
  if (choice.id === 'fisher_nets') {
    return !hasHavenFlag(save, ULF_NETS_COMPLETE_FLAG);
  }
  return true;
}

export function fisherMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter((choice) => isFisherChoiceVisible(choice, save));
}

function fisherGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (hasHavenFlag(save, FISH_QUEST_COMPLETE_FLAG)) {
    return {
      text: 'Трактир накормлен ухой, на причале порядок. Всегда рад честным рукам!',
      portrait: 'happy',
    };
  }
  if (hasHavenFlag(save, FISH_QUEST_DELIVERED_FLAG)) {
    return {
      text: 'Вижу в руках расписку от Марты! Давай сюда, пора рассчитаться за честную доставку.',
      portrait: 'happy',
    };
  }
  if (hasHavenFlag(save, FISH_QUEST_ACTIVE_FLAG)) {
    return {
      text: 'Рыба скоро заснёт и потеряет свежесть! Отнеси три штуки Марте в таверну на востоке.',
      portrait: 'neutral',
    };
  }
  if (hasHavenFlag(save, ULF_NETS_COMPLETE_FLAG)) {
    return {
      text: 'Сети целые благодаря тебе. Наживка и улов — как всегда, здесь, на причале.',
      portrait: 'happy',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

export function generateFisherNetsDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== TOWN_FISHER_NPC_ID) return null;
  const greeting = fisherGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, fisherMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: FisherNetsResult,
  portrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, fisherMenuChoices(npc, result.save)),
      portrait: result.ok ? portrait : 'serious',
    }),
  };
}

export function applyFisherNetsChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== TOWN_FISHER_NPC_ID) return null;

  if (choiceId === 'fisher_bait') {
    return followUpFromResult(npc, fisherBuyBait(save), 'work');
  }
  if (choiceId === 'fisher_nets') {
    return followUpFromResult(npc, fisherMendNets(save), 'work');
  }

  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  return null;
}
