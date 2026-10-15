/**
 * Dialogue plugin for town_scribe (Писец Ирина).
 * Returns null for flavor YAML nodes so DialogueService can follow nextNode.
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
  claimArchiveFolio,
  copyTravelWrit,
  PORT_FOLIO_ID,
  requestArchiveClarity,
  SCRIBE_FOLIO_ACTIVE_FLAG,
  SCRIBE_FOLIO_COMPLETE_FLAG,
  startArchiveSearch,
  TRAVEL_WRIT_ID,
  type ScribeArchiveResult,
} from './scribe-archive.js';

export const SCRIBE_NPC_ID = 'town_scribe';

const MECHANIC_CHOICES = new Set([
  'scribe_copy_writ',
  'scribe_search',
  'scribe_claim_folio',
  'scribe_clarity',
]);

function hasItem(save: PlayerSave, itemId: string): boolean {
  return (save.inventory ?? []).includes(itemId);
}

function greetingFor(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (save.questFlags[SCRIBE_FOLIO_ACTIVE_FLAG]) {
    return {
      text: 'Архив уже роется. Забери опись, пока полки не смешали.',
      portrait: 'serious',
    };
  }

  const hasWrit = hasItem(save, TRAVEL_WRIT_ID);
  const hasFolio = hasItem(save, PORT_FOLIO_ID);
  if (hasWrit && hasFolio) {
    return {
      text: 'Грамота и опись у тебя — печать свежая, причалы не перепутаешь. Нужна ещё копия или ясность строк?',
      portrait: 'happy',
    };
  }
  if (hasWrit) {
    return {
      text: 'Путевая грамота при тебе. Ворота Гавани узнают печать скриптория — не мни углы.',
      portrait: 'happy',
    };
  }
  if (hasFolio) {
    return {
      text: 'Опись причалов в сумке. Не таскай свиток в дождь — чернила поплывут.',
      portrait: 'happy',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

function filterScribeChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const flags = save.questFlags;
  const active = Boolean(flags[SCRIBE_FOLIO_ACTIVE_FLAG]);
  const complete = Boolean(flags[SCRIBE_FOLIO_COMPLETE_FLAG]);

  return filterHavenChoices(npc.choices ?? [], save).filter((choice) => {
    if (choice.id === 'scribe_search') return !active && !complete;
    if (choice.id === 'scribe_claim_folio') return active && !complete;
    return true;
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: ScribeArchiveResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, [
        {
          id: 'scribe_leave',
          label: result.ok ? 'Благодарю.' : 'Понятно.',
          flag: '_scribe_done',
          portrait: result.ok ? 'happy' : 'serious',
        },
      ]),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateScribeDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== SCRIBE_NPC_ID) return null;

  const scene = greetingFor(npc, save);
  return withDialogueScene(npc, {
    text: scene.text,
    choices: mapDialogueChoices(npc, filterScribeChoices(npc, save)),
    portrait: scene.portrait,
  });
}

export function applyScribeChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== SCRIBE_NPC_ID) return null;
  if (!MECHANIC_CHOICES.has(choiceId)) return null;

  if (choiceId === 'scribe_copy_writ') {
    return followUpFromResult(npc, copyTravelWrit(save), 'work');
  }
  if (choiceId === 'scribe_search') {
    return followUpFromResult(npc, startArchiveSearch(save), 'serious');
  }
  if (choiceId === 'scribe_claim_folio') {
    return followUpFromResult(npc, claimArchiveFolio(save), 'happy');
  }
  return followUpFromResult(npc, requestArchiveClarity(save), 'happy');
}

export const scribeArchivePlugin: HavenNpcFeaturePlugin = {
  generate: generateScribeDialogue,
  apply: applyScribeChoice,
};
