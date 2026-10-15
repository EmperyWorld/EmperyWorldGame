/**
 * Dialogue plugin for Хозяйка трактира Марта (town_innkeeper).
 * Mechanic id: marta_stew.
 * Dice / rest / fish / provisions / flavor return null — parent keeps inn_dice, inn_rest, inn_fish_delivery.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  filterHavenChoices,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import {
  FISH_QUEST_ACTIVE_FLAG,
  FISH_QUEST_DELIVERED_FLAG,
} from './haven-services.js';
import {
  MARTA_NPC_ID,
  MARTA_STEW_COST,
  buyMartaStew,
  type MartaStewResult,
} from './marta-stew.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'inn_fish_delivery',
  'inn_provisions',
  'inn_rest',
  'inn_dice',
  'inn_dice_10',
  'inn_dice_25',
  'inn_dice_50',
  'inn_dice_leave',
  'inn_night',
  'inn_leave',
]);

const STEW_EXTRA: HavenNpcChoice = {
  id: 'marta_stew',
  label: `Ночной горшок Марты (${MARTA_STEW_COST} адены)`,
  flag: '_marta_stew',
  portrait: 'happy',
};

const MENU_ORDER = [
  'inn_fish_delivery',
  'inn_provisions',
  'marta_stew',
  'inn_rest',
  'inn_dice',
  'inn_night',
  'inn_leave',
];

function stewMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  if (!byId.has(STEW_EXTRA.id)) byId.set(STEW_EXTRA.id, STEW_EXTRA);

  const ordered: HavenNpcChoice[] = [];
  for (const id of MENU_ORDER) {
    const choice = byId.get(id);
    if (choice) {
      ordered.push(choice);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());
  return filterHavenChoices(ordered, save).filter((choice) => {
    if (choice.id === 'inn_fish_delivery') {
      return Boolean(save.questFlags[FISH_QUEST_ACTIVE_FLAG]) && !save.questFlags[FISH_QUEST_DELIVERED_FLAG];
    }
    return true;
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: MartaStewResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  const menu = generateMartaStewDialogue(npc, result.save);
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: menu?.choices ?? [],
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateMartaStewDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== MARTA_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, stewMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

export function applyMartaStewChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== MARTA_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'marta_stew') {
    return followUpFromResult(npc, buyMartaStew(save), 'happy');
  }
  return null;
}

export const martaStewPlugin: HavenNpcFeaturePlugin = {
  generate: generateMartaStewDialogue,
  apply: applyMartaStewChoice,
};
