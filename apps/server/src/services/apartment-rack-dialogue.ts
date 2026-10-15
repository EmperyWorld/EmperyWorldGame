/**
 * Dialogue plugin for apartment_rack (Стеллаж снаряжения).
 * Mechanic: apt_polish. open_storage MUST fall through (client gear bag).
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
  APT_POLISH_COST,
  aptPolish,
  type ApartmentRackResult,
} from './apartment-rack.js';

export const APARTMENT_RACK_NPC_ID = 'apartment_rack';

const YAML_PASSTHROUGH = new Set(['open_storage']);

const POLISH_CHOICE: HavenNpcChoice = {
  id: 'apt_polish',
  label: `Натереть доспех (${APT_POLISH_COST} адены)`,
  flag: '_apt_polish',
  portrait: 'work',
};

const MENU_ORDER = ['open_storage', 'apt_polish'];

export function filterApartmentRackChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  if (!byId.has(POLISH_CHOICE.id)) {
    byId.set(POLISH_CHOICE.id, POLISH_CHOICE);
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

export function generateApartmentRackDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== APARTMENT_RACK_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, filterApartmentRackChoices(npc, save)),
    portrait: 'neutral',
  });
}

function followUpFromResult(npc: HavenNpcLike, result: ApartmentRackResult): HavenNpcChoiceResult {
  const menu = generateApartmentRackDialogue(npc, result.save);
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: menu?.choices ?? mapDialogueChoices(npc, filterApartmentRackChoices(npc, result.save)),
      portrait: result.ok ? 'work' : 'serious',
    }),
  };
}

/**
 * Only apt_polish is handled here.
 * open_storage MUST return null so the client still opens gear storage.
 */
export function applyApartmentRackChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== APARTMENT_RACK_NPC_ID) return null;
  if (YAML_PASSTHROUGH.has(choiceId) || choiceId.endsWith('_bye')) return null;
  if (choiceId !== 'apt_polish') return null;
  return followUpFromResult(npc, aptPolish(save));
}

export const apartmentRackPlugin: HavenNpcFeaturePlugin = {
  generate: generateApartmentRackDialogue,
  apply: applyApartmentRackChoice,
};
