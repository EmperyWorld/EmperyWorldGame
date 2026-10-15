/**
 * Dialogue plugin for town_informant (Информатор).
 * Mechanic ids: informant_dossier / informant_contract / informant_claim.
 * rumor_latest / rumor_shady / rumor_leave stay on DialogueService — apply returns null.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  filterHavenChoices,
  hasHavenFlag,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import {
  INFORMANT_CONTRACT_ACTIVE_FLAG,
  INFORMANT_CONTRACT_COMPLETE_FLAG,
  INFORMANT_NPC_ID,
  WHISPER_DOSSIER_ID,
  buyDossier,
  buyShadyContract,
  claimShadyContract,
  type InformantDossierResult,
} from './informant-dossier.js';
import { getLatestRumors, getShadyRumors } from './rumors.js';

const RUMOR_CHOICE_IDS = new Set(['rumor_latest', 'rumor_shady', 'rumor_leave', 'informant_night']);

const MECHANIC_CHOICES = new Set([
  'informant_dossier',
  'informant_contract',
  'informant_claim',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'informant_dossier',
    label: 'Купить досье (18 адены)',
    flag: '_informant_dossier',
    portrait: 'serious',
  },
  {
    id: 'informant_contract',
    label: 'Заплатить за имя (25 адены)',
    flag: '_informant_contract',
    portrait: 'happy',
  },
  {
    id: 'informant_claim',
    label: 'Забрать долю',
    flag: '_informant_claim',
    portrait: 'happy',
  },
];

const MENU_ORDER = [
  'informant_dossier',
  'informant_contract',
  'informant_claim',
  'rumor_latest',
  'rumor_shady',
  'informant_night',
  'rumor_leave',
];

function hasItem(save: PlayerSave, itemId: string): boolean {
  return (save.inventory ?? []).includes(itemId);
}

function greetingFor(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (hasHavenFlag(save, INFORMANT_CONTRACT_ACTIVE_FLAG)) {
    return {
      text: 'Имя сработало. Забери долю — клинок уже должен быть доказан.',
      portrait: 'serious',
    };
  }
  if (hasItem(save, WHISPER_DOSSIER_ID)) {
    return {
      text: 'Бумага у тебя. Не разворачивай у стражи. Нужно ещё имя — или свежий слух?',
      portrait: 'happy',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

function isMechanicVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  const active = hasHavenFlag(save, INFORMANT_CONTRACT_ACTIVE_FLAG);
  const complete = hasHavenFlag(save, INFORMANT_CONTRACT_COMPLETE_FLAG);
  if (choice.id === 'informant_contract') return !active && !complete;
  if (choice.id === 'informant_claim') return active && !complete;
  return true;
}

export function informantMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter((choice) => isMechanicVisible(choice, save));
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: InformantDossierResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, informantMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateInformantDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== INFORMANT_NPC_ID) return null;

  const scene = greetingFor(npc, save);
  return withDialogueScene(npc, {
    text: scene.text,
    choices: mapDialogueChoices(npc, informantMenuChoices(npc, save)),
    portrait: scene.portrait,
  });
}

export function applyInformantChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== INFORMANT_NPC_ID) return null;
  if (RUMOR_CHOICE_IDS.has(choiceId)) {
    // Same pools DialogueService uses; apply stays null so rumor_latest / rumor_shady keep working.
    void (choiceId === 'rumor_shady' ? getShadyRumors() : getLatestRumors());
    return null;
  }
  if (!MECHANIC_CHOICES.has(choiceId)) return null;

  if (choiceId === 'informant_dossier') {
    return followUpFromResult(npc, buyDossier(save), 'serious');
  }
  if (choiceId === 'informant_contract') {
    return followUpFromResult(npc, buyShadyContract(save), 'happy');
  }
  return followUpFromResult(npc, claimShadyContract(save), 'happy');
}

export const informantDossierPlugin: HavenNpcFeaturePlugin = {
  generate: generateInformantDialogue,
  apply: applyInformantChoice,
};
