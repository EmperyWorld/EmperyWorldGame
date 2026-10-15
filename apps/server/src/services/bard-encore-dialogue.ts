/**
 * Dialogue plugin for Бард Кай (stage_bard).
 * Mechanic id: bard_encore. Existing bard_buff / custom songs stay in dialogue.ts.
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
  BARD_ENCORE_COST,
  requestBardEncore,
  type BardEncoreResult,
} from './bard-encore.js';

export const BARD_ENCORE_NPC_ID = 'stage_bard';

const YAML_FALLTHROUGH_IDS = new Set([
  'bard_buff',
  'bard_stories',
  'bard_song_custom',
  'bard_leave',
]);

const ENCORE_CHOICE: HavenNpcChoice = {
  id: 'bard_encore',
  label: `Попросить бис (${BARD_ENCORE_COST} адены)`,
  flag: '_bard_encore',
  portrait: 'sing',
};

const MENU_ORDER = [
  'bard_buff',
  'bard_encore',
  'bard_stories',
  'bard_song_custom',
  'bard_leave',
];

function yamlOrFallback(npc: HavenNpcLike, fallback: HavenNpcChoice): HavenNpcChoice {
  return npc.choices.find((choice) => choice.id === fallback.id) ?? fallback;
}

export function bardEncoreMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  byId.set('bard_encore', yamlOrFallback(npc, ENCORE_CHOICE));

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

function followUpFromResult(npc: HavenNpcLike, result: BardEncoreResult): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, bardEncoreMenuChoices(npc, result.save)),
      portrait: result.ok ? 'sing' : 'neutral',
    }),
  };
}

export function generateBardEncoreDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== BARD_ENCORE_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, bardEncoreMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

export function applyBardEncoreChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== BARD_ENCORE_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;
  if (choiceId !== 'bard_encore') return null;
  return followUpFromResult(npc, requestBardEncore(save));
}

export const bardEncorePlugin: HavenNpcFeaturePlugin = {
  generate: generateBardEncoreDialogue,
  apply: applyBardEncoreChoice,
};
