/**
 * Dialogue plugin for Банщица Ника (town_bathkeeper).
 * Mechanic id: bath_oil. Session/tea/flavor stay on the parent (haven-services / YAML).
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
  BATH_NPC_ID,
  BATH_OIL_COST,
  buyNikaOil,
  type BathOilResult,
} from './bath-oil.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'bath_session',
  'bath_tea',
  'bath_rest',
  'bath_rules',
  'bath_leave',
  'bath_steam_bye',
  'bath_rules_bye',
]);

const OIL_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'bath_oil',
    label: `Банное масло (${BATH_OIL_COST} адены)`,
    flag: '_bath_oil',
    portrait: 'happy',
  },
];

const MENU_ORDER = [
  'bath_session',
  'bath_tea',
  'bath_oil',
  'bath_rest',
  'bath_rules',
  'bath_leave',
];

export function bathOilMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  for (const extra of OIL_EXTRAS) {
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
  return filterHavenChoices(ordered, save);
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: BathOilResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, bathOilMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateBathOilDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== BATH_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, bathOilMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

export function applyBathOilChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== BATH_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'bath_oil') {
    return followUpFromResult(npc, buyNikaOil(save), 'happy');
  }

  return null;
}

export const bathOilPlugin: HavenNpcFeaturePlugin = {
  generate: generateBathOilDialogue,
  apply: applyBathOilChoice,
};
