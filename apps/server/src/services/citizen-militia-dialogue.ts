/**
 * Dialogue plugin for haven_citizen_guard (городской стражник, не Леон).
 * DialogueService wires generateCitizenMilitiaDialogue / applyCitizenMilitiaChoice.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { formatCitizenGreeting } from './citizen-rumors.js';
import {
  filterHavenChoices,
  hasHavenFlag,
  isCitizenDialogueFallthrough,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  CITIZEN_GUARD_NPC_ID,
  MILITIA_WATCH_COMPLETE_FLAG,
  militiaDrill,
  militiaWatch,
  type CitizenMilitiaResult,
} from './citizen-militia.js';

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'militia_drill',
    label: 'Пройти муштру ополчения',
    flag: '_militia_drill',
    portrait: 'serious',
  },
  {
    id: 'militia_watch',
    label: 'Выйти добровольцем на стену',
    flag: '_militia_watch',
    blocks: [MILITIA_WATCH_COMPLETE_FLAG],
    portrait: 'happy',
  },
];

const MENU_ORDER = [
  'militia_drill',
  'militia_watch',
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
];

function isMilitiaChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'militia_watch') {
    return !hasHavenFlag(save, MILITIA_WATCH_COMPLETE_FLAG);
  }
  return true;
}

export function citizenMilitiaMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter((choice) =>
    isMilitiaChoiceVisible(choice, save),
  );
}

export function generateCitizenMilitiaDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== CITIZEN_GUARD_NPC_ID) return null;
  const greeting = formatCitizenGreeting(npc.defaultGreeting, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, citizenMilitiaMenuChoices(npc, save)),
    portrait: greeting.mood,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: CitizenMilitiaResult,
  portrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, citizenMilitiaMenuChoices(npc, result.save)),
      portrait: result.ok ? portrait : 'serious',
    }),
  };
}

export function applyCitizenMilitiaChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== CITIZEN_GUARD_NPC_ID) return null;
  if (isCitizenDialogueFallthrough(choiceId)) return null;

  if (choiceId === 'militia_drill') {
    return followUpFromResult(npc, militiaDrill(save), 'serious');
  }
  if (choiceId === 'militia_watch') {
    return followUpFromResult(npc, militiaWatch(save), 'happy');
  }

  return null;
}

export const citizenMilitiaPlugin: HavenNpcFeaturePlugin = {
  generate: generateCitizenMilitiaDialogue,
  apply: applyCitizenMilitiaChoice,
};
