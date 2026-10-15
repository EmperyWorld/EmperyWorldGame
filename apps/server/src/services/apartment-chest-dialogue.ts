/**
 * Dialogue plugin for apartment_chest (Большой сундук).
 * Mechanic: apt_kit. open_storage MUST fall through (client materials bag).
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
  APT_CHEST_NPC_ID,
  APT_KIT_CHOICE_ID,
  APT_KIT_COST,
  assembleAptKit,
  type ApartmentChestResult,
} from './apartment-chest.js';

const YAML_PASSTHROUGH = new Set(['open_storage']);

const KIT_CHOICE: HavenNpcChoice = {
  id: APT_KIT_CHOICE_ID,
  label: `Собрать дорожный набор (${APT_KIT_COST} адены)`,
  flag: '_apt_kit',
  portrait: 'neutral',
};

const MENU_ORDER = ['open_storage', APT_KIT_CHOICE_ID];

export function filterApartmentChestChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  if (!byId.has(KIT_CHOICE.id)) {
    byId.set(KIT_CHOICE.id, KIT_CHOICE);
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

export function generateApartmentChestDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== APT_CHEST_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, filterApartmentChestChoices(npc, save)),
    portrait: 'neutral',
  });
}

function followUpFromResult(npc: HavenNpcLike, result: ApartmentChestResult): HavenNpcChoiceResult {
  const menu = generateApartmentChestDialogue(npc, result.save);
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: menu?.choices ?? mapDialogueChoices(npc, filterApartmentChestChoices(npc, result.save)),
      portrait: result.ok ? 'neutral' : 'serious',
    }),
  };
}

/**
 * Only apt_kit is handled here.
 * open_storage MUST return null so the client still opens materials storage.
 */
export function applyApartmentChestChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== APT_CHEST_NPC_ID) return null;
  if (YAML_PASSTHROUGH.has(choiceId) || choiceId.endsWith('_bye')) return null;
  if (choiceId !== APT_KIT_CHOICE_ID) return null;
  return followUpFromResult(npc, assembleAptKit(save));
}

export const apartmentChestPlugin: HavenNpcFeaturePlugin = {
  generate: generateApartmentChestDialogue,
  apply: applyApartmentChestChoice,
};
