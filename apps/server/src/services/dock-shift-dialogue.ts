/**
 * Диалог портовой смены Петра. Плагин: generate/apply; DialogueService подключает снаружи.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  filterHavenChoices,
  hasHavenFlag,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import {
  DOCKHAND_NPC_ID,
  DOCK_SHIFT_ACTIVE_FLAG,
  abandonDockShift,
  finishDockShift,
  startDockShift,
  type DockShiftResult,
} from './dock-shift.js';

const SHIFT_CHOICE_IDS = new Set(['dock_shift_start', 'dock_shift_finish', 'dock_shift_abandon']);

const START_CHOICE: HavenNpcChoice = {
  id: 'dock_shift_start',
  label: 'Взять смену с ящиками',
  flag: '_dock_shift_start',
  portrait: 'work',
};

const FINISH_CHOICE: HavenNpcChoice = {
  id: 'dock_shift_finish',
  label: 'Сдать ящики',
  flag: '_dock_shift_finish',
  portrait: 'happy',
};

const ABANDON_CHOICE: HavenNpcChoice = {
  id: 'dock_shift_abandon',
  label: 'Отказаться от смены',
  flag: '_dock_shift_abandon',
  portrait: 'serious',
};

function yamlOrFallback(npc: HavenNpcLike, fallback: HavenNpcChoice): HavenNpcChoice {
  return npc.choices.find((choice) => choice.id === fallback.id) ?? fallback;
}

function isFlavorChoice(choiceId: string): boolean {
  return (
    choiceId === 'dock_work' ||
    choiceId === 'dock_warn' ||
    choiceId === 'dock_leave' ||
    choiceId.endsWith('_bye')
  );
}

function followUpFromShift(npc: HavenNpcLike, result: DockShiftResult): DialogueResponse | undefined {
  const menu = generateDockDialogue(npc, result.save);
  if (!menu) return undefined;
  return withDialogueScene(npc, {
    text: result.message,
    choices: menu.choices,
    portrait: result.ok ? 'happy' : 'serious',
  });
}

export function generateDockDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null {
  if (npc.id !== DOCKHAND_NPC_ID) return null;

  const active = hasHavenFlag(save, DOCK_SHIFT_ACTIVE_FLAG);
  const flavor = filterHavenChoices(
    npc.choices.filter((choice) => !SHIFT_CHOICE_IDS.has(choice.id)),
    save,
  );

  const shiftChoices: HavenNpcChoice[] = [];
  if (!active) {
    shiftChoices.push(yamlOrFallback(npc, START_CHOICE));
  } else {
    shiftChoices.push(yamlOrFallback(npc, FINISH_CHOICE));
    shiftChoices.push(yamlOrFallback(npc, ABANDON_CHOICE));
  }

  return withDialogueScene(npc, {
    text: active ? 'Ну что, ящики на месте?' : npc.defaultGreeting,
    choices: mapDialogueChoices(npc, [...shiftChoices, ...flavor]),
    portrait: active ? 'work' : 'default',
  });
}

export function applyDockChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== DOCKHAND_NPC_ID) return null;
  if (isFlavorChoice(choiceId)) return null;

  if (choiceId === 'dock_supplies') {
    return { save };
  }

  if (choiceId === 'dock_shift_start') {
    const result = startDockShift(save);
    return {
      save: result.save,
      townMessage: result.message,
      followUp: followUpFromShift(npc, result),
    };
  }

  if (choiceId === 'dock_shift_finish') {
    const result = finishDockShift(save);
    return {
      save: result.save,
      townMessage: result.message,
      followUp: followUpFromShift(npc, result),
    };
  }

  if (choiceId === 'dock_shift_abandon') {
    const result = abandonDockShift(save);
    return {
      save: result.save,
      townMessage: result.message,
      followUp: followUpFromShift(npc, result),
    };
  }

  return null;
}
