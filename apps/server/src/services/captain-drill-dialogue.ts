/**
 * Dialogue plugin for town_captain (Капитан Гаррет).
 * Mechanic: captain_drill. YAML flavor (grove/travel/depths/bye) falls through.
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
import { captainDrill, CAPTAIN_DRILL_COST, type CaptainDrillResult } from './captain-drill.js';

const NPC_ID = 'town_captain';

const YAML_FALLTHROUGH_IDS = new Set([
  'captain_grove',
  'captain_travel',
  'captain_depths',
  'captain_bye',
  'depths_go',
]);

const DRILL_CHOICE: HavenNpcChoice = {
  id: 'captain_drill',
  label: `Строевая подготовка (${CAPTAIN_DRILL_COST} адены)`,
  flag: '_captain_drill',
  portrait: 'action',
};

const MENU_ORDER = [
  'captain_drill',
  'captain_grove',
  'captain_travel',
  'captain_depths',
  'captain_bye',
];

function depthsUnlocked(save: PlayerSave): boolean {
  return (
    hasHavenFlag(save, 'quest_grove_complete') || hasHavenFlag(save, 'quest_betrayal_complete')
  );
}

function isCaptainChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'captain_depths' && !depthsUnlocked(save)) return false;
  return true;
}

export function captainMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  if (!byId.has(DRILL_CHOICE.id)) byId.set(DRILL_CHOICE.id, DRILL_CHOICE);

  const ordered: HavenNpcChoice[] = [];
  for (const id of MENU_ORDER) {
    const choice = byId.get(id);
    if (choice) {
      ordered.push(choice);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());

  return filterHavenChoices(ordered, save).filter((choice) => isCaptainChoiceVisible(choice, save));
}

export function generateCaptainDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, captainMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: CaptainDrillResult,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, captainMenuChoices(npc, result.save)),
      portrait: result.ok ? 'action' : 'serious',
    }),
  };
}

export function applyCaptainChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;
  if (choiceId !== 'captain_drill') return null;
  return followUpFromResult(npc, captainDrill(save));
}
