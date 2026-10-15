/**
 * Dialogue plugin for apartment_bed (Кровать).
 * Mechanic: apt_linen. rest_here MUST fall through so the client rest API stays.
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
  apartmentLinenRest,
  type ApartmentBedResult,
} from './apartment-bed.js';

export const APARTMENT_BED_NPC_ID = 'apartment_bed';

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  { id: 'rest_here', label: 'Отдохнуть', flag: '_apt_rest', portrait: 'neutral' },
  {
    id: 'apt_linen',
    label: 'Перестелить и отдохнуть',
    flag: '_apt_linen',
    portrait: 'happy',
  },
];

const MENU_ORDER = ['rest_here', 'apt_linen'];

function isApartmentBed(npc: HavenNpcLike): boolean {
  return npc.id === APARTMENT_BED_NPC_ID;
}

export function apartmentBedMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save);
}

export function generateApartmentBedDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (!isApartmentBed(npc)) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, apartmentBedMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: ApartmentBedResult,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, apartmentBedMenuChoices(npc, result.save)),
      portrait: result.ok ? 'happy' : 'serious',
    }),
  };
}

/**
 * Only apt_linen is handled here.
 * rest_here MUST return null so the parent/client rest API still works.
 */
export function applyApartmentBedChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (!isApartmentBed(npc)) return null;
  if (choiceId !== 'apt_linen') return null;
  return followUpFromResult(npc, apartmentLinenRest(save));
}

export const apartmentBedPlugin: HavenNpcFeaturePlugin = {
  generate: generateApartmentBedDialogue,
  apply: applyApartmentBedChoice,
};
