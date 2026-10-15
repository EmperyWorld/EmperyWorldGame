/**
 * Dialogue plugin for haven_citizen_plaza (форум / площадь).
 * Flavor citizen_rumors / citizen_advice / citizen_leave fall through to YAML.
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
  buyPlazaCharm,
  PLAZA_CHARM_COMPLETE_FLAG,
  PLAZA_CHARM_COST,
  PLAZA_COIN_COST,
  PLAZA_NPC_ID,
  tossPlazaCoin,
  type CitizenPlazaResult,
} from './citizen-plaza.js';

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'plaza_coin',
    label: `Бросить монету в фонтан (${PLAZA_COIN_COST} адены)`,
    flag: '_plaza_coin',
    portrait: 'happy',
  },
  {
    id: 'plaza_charm',
    label: `Купить талисман площади (${PLAZA_CHARM_COST} адены)`,
    flag: '_plaza_charm',
    blocks: [PLAZA_CHARM_COMPLETE_FLAG],
    portrait: 'happy',
  },
];

const MENU_ORDER = [
  'plaza_coin',
  'plaza_charm',
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
];

function isPlazaChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'plaza_charm') {
    return !save.questFlags[PLAZA_CHARM_COMPLETE_FLAG];
  }
  return true;
}

export function plazaMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter((choice) => isPlazaChoiceVisible(choice, save));
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: CitizenPlazaResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, plazaMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateCitizenPlazaDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== PLAZA_NPC_ID) return null;
  const greeting = formatCitizenGreeting(npc.defaultGreeting, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, plazaMenuChoices(npc, save)),
    portrait: greeting.mood,
  });
}

export function applyCitizenPlazaChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== PLAZA_NPC_ID) return null;
  if (isCitizenDialogueFallthrough(choiceId)) return null;

  if (choiceId === 'plaza_coin') {
    return followUpFromResult(npc, tossPlazaCoin(save), 'happy');
  }
  if (choiceId === 'plaza_charm') {
    return followUpFromResult(npc, buyPlazaCharm(save), 'happy');
  }

  return { save };
}

export const citizenPlazaPlugin: HavenNpcFeaturePlugin = {
  generate: generateCitizenPlazaDialogue,
  apply: applyCitizenPlazaChoice,
};
