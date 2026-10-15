/**
 * Dialogue plugin for haven_citizen_cathedral (Паломник Гавани).
 * Mechanic ids: cathedral_ribbon / cathedral_pilgrim_alms.
 * Rumors/advice/leave return null — DialogueService keeps citizen-rumors.
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
  CATHEDRAL_ALMS_COST,
  CATHEDRAL_CITIZEN_NPC_ID,
  CATHEDRAL_RIBBON_COST,
  buyPrayerRibbon,
  givePilgrimAlms,
  type CitizenCathedralResult,
} from './citizen-cathedral.js';

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'cathedral_ribbon',
    label: `Купить молитвенную ленту (${CATHEDRAL_RIBBON_COST} адены)`,
    flag: '_cathedral_ribbon',
    portrait: 'happy',
  },
  {
    id: 'cathedral_pilgrim_alms',
    label: `Подать милостыню (${CATHEDRAL_ALMS_COST} адены)`,
    flag: '_cathedral_pilgrim_alms',
    portrait: 'happy',
  },
];

const MENU_ORDER = [
  'cathedral_ribbon',
  'cathedral_pilgrim_alms',
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
];

function cathedralMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

function followUpFromResult(
  npc: HavenNpcLike,
  result: CitizenCathedralResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  const menu = generateCitizenCathedralDialogue(npc, result.save);
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: menu?.choices ?? [],
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateCitizenCathedralDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== CATHEDRAL_CITIZEN_NPC_ID) return null;
  const greeting = formatCitizenGreeting(npc.defaultGreeting, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, cathedralMenuChoices(npc, save)),
    portrait: greeting.mood,
  });
}

export function applyCitizenCathedralChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== CATHEDRAL_CITIZEN_NPC_ID) return null;
  if (isCitizenDialogueFallthrough(choiceId)) return null;

  if (choiceId === 'cathedral_ribbon') {
    return followUpFromResult(npc, buyPrayerRibbon(save), 'happy');
  }
  if (choiceId === 'cathedral_pilgrim_alms') {
    return followUpFromResult(npc, givePilgrimAlms(save), 'happy');
  }

  return null;
}

export const citizenCathedralPlugin: HavenNpcFeaturePlugin = {
  generate: generateCitizenCathedralDialogue,
  apply: applyCitizenCathedralChoice,
};
