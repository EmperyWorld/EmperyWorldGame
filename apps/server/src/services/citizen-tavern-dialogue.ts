/**
 * Dialogue plugin for haven_citizen_tavern (Завсегдатай таверны).
 * Mechanic: tavern_round. YAML rumors/advice/leave fall through.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { formatCitizenGreeting } from './citizen-rumors.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  filterHavenChoices,
  isCitizenDialogueFallthrough,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import {
  TAVERN_ROUND_COST,
  tavernRound,
  type CitizenTavernResult,
} from './citizen-tavern.js';

export const CITIZEN_TAVERN_NPC_ID = 'haven_citizen_tavern';

const ROUND_CHOICE: HavenNpcChoice = {
  id: 'tavern_round',
  label: `Поставить круг (${TAVERN_ROUND_COST} адены)`,
  flag: '_cit_round',
  portrait: 'happy',
};

const MENU_ORDER = [
  'tavern_round',
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
];

function yamlOrFallback(npc: HavenNpcLike, fallback: HavenNpcChoice): HavenNpcChoice {
  return npc.choices.find((choice) => choice.id === fallback.id) ?? fallback;
}

export function citizenTavernMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  byId.set('tavern_round', yamlOrFallback(npc, ROUND_CHOICE));

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

export function generateCitizenTavernDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== CITIZEN_TAVERN_NPC_ID) return null;
  const greeting = formatCitizenGreeting(npc.defaultGreeting, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, citizenTavernMenuChoices(npc, save)),
    portrait: greeting.mood,
  });
}

function followUpFromResult(npc: HavenNpcLike, result: CitizenTavernResult): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, citizenTavernMenuChoices(npc, result.save)),
      portrait: result.ok ? 'happy' : 'serious',
    }),
  };
}

export function applyCitizenTavernChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== CITIZEN_TAVERN_NPC_ID) return null;
  if (isCitizenDialogueFallthrough(choiceId) || choiceId.endsWith('_bye')) return null;
  if (choiceId !== 'tavern_round') return null;
  return followUpFromResult(npc, tavernRound(save));
}

export const citizenTavernPlugin: HavenNpcFeaturePlugin = {
  generate: generateCitizenTavernDialogue,
  apply: applyCitizenTavernChoice,
};
