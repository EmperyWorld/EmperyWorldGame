/**
 * Dialogue plugin for haven_citizen_harbor (Моряк Гавани).
 * Mechanic: harbor_knot / harbor_haul. Rumors/advice/leave fall through to citizen-rumors.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { formatCitizenGreeting } from './citizen-rumors.js';
import {
  filterHavenChoices,
  isCitizenDialogueFallthrough,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  HARBOR_HAUL_STAMINA_COST,
  HARBOR_KNOT_COST,
  HARBOR_NPC_ID,
  harborHaul,
  harborKnot,
  type CitizenHarborResult,
} from './citizen-harbor.js';

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'harbor_knot',
    label: `Завязать узел моряка (${HARBOR_KNOT_COST} адены)`,
    flag: '_harbor_knot',
    portrait: 'happy',
  },
  {
    id: 'harbor_haul',
    label: `Перетащить снасти (${HARBOR_HAUL_STAMINA_COST} выносливости)`,
    flag: '_harbor_haul',
    portrait: 'serious',
  },
];

const MENU_ORDER = [
  'harbor_knot',
  'harbor_haul',
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
];

export function harborMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

export function generateCitizenHarborDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== HARBOR_NPC_ID) return null;
  const greeting = formatCitizenGreeting(npc.defaultGreeting, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, harborMenuChoices(npc, save)),
    portrait: greeting.mood !== 'neutral' ? greeting.mood : 'neutral',
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: CitizenHarborResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, harborMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function applyCitizenHarborChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== HARBOR_NPC_ID) return null;
  if (isCitizenDialogueFallthrough(choiceId)) return null;

  if (choiceId === 'harbor_knot') {
    return followUpFromResult(npc, harborKnot(save), 'happy');
  }
  if (choiceId === 'harbor_haul') {
    return followUpFromResult(npc, harborHaul(save), 'serious');
  }

  return null;
}

export const citizenHarborPlugin: HavenNpcFeaturePlugin = {
  generate: generateCitizenHarborDialogue,
  apply: applyCitizenHarborChoice,
};
