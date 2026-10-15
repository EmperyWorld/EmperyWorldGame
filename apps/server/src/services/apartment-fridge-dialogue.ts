/**
 * Dialogue plugin for apartment_fridge (Ледник-холодильник).
 * Mechanic: apt_ration. open_storage stays client-intercepted.
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
  APT_FRIDGE_NPC_ID,
  isAptRationTakenToday,
  takeAptRation,
  type AptFridgeResult,
} from './apartment-fridge.js';

const RATION_CHOICE: HavenNpcChoice = {
  id: 'apt_ration',
  label: 'Взять паёк жильца',
  flag: '_apt_ration',
  portrait: 'neutral',
};

const MENU_ORDER = ['open_storage', 'apt_ration'];

function fridgeMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  if (!byId.has(RATION_CHOICE.id)) {
    byId.set(RATION_CHOICE.id, RATION_CHOICE);
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

function fridgeGreeting(
  npc: HavenNpcLike,
  save: PlayerSave,
  now: Date,
): { text: string; portrait: string } {
  if (!save.housing) {
    return { text: npc.defaultGreeting, portrait: 'neutral' };
  }
  if (isAptRationTakenToday(save, now)) {
    return {
      text: `${npc.defaultGreeting} Паёк на сегодня уже забрали.`,
      portrait: 'neutral',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

export function generateApartmentFridgeDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
  now: Date = new Date(),
): DialogueResponse | null {
  if (npc.id !== APT_FRIDGE_NPC_ID) return null;
  const greeting = fridgeGreeting(npc, save, now);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, fridgeMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(npc: HavenNpcLike, result: AptFridgeResult): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, fridgeMenuChoices(npc, result.save)),
      portrait: result.ok ? 'happy' : 'serious',
    }),
  };
}

/**
 * Only apt_ration is handled here.
 * open_storage MUST return null so the client still opens housing food storage.
 */
export function applyApartmentFridgeChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
  now: Date = new Date(),
): HavenNpcChoiceResult | null {
  if (npc.id !== APT_FRIDGE_NPC_ID) return null;
  if (choiceId === 'open_storage') return null;
  if (choiceId !== 'apt_ration') return null;
  return followUpFromResult(npc, takeAptRation(save, now));
}

export const apartmentFridgePlugin: HavenNpcFeaturePlugin = {
  generate: generateApartmentFridgeDialogue,
  apply: applyApartmentFridgeChoice,
};
