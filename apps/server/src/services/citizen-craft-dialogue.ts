/**
 * Dialogue plugin for haven_citizen_craft (Подмастерье Гавани).
 * DialogueService wires generateCitizenCraftDialogue / applyCitizenCraftChoice.
 * Rumors / advice / leave fall through to citizen-rumors handlers in dialogue.ts.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { formatCitizenGreeting } from './citizen-rumors.js';
import {
  filterHavenChoices,
  hasHavenFlag,
  isCitizenDialogueFallthrough,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  CRAFT_BELLOWS_COMPLETE_FLAG,
  CRAFT_NPC_ID,
  CRAFT_SCRAP_COST,
  buyCraftScrap,
  pumpCraftBellows,
  type CitizenCraftResult,
} from './citizen-craft.js';

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'craft_scrap',
    label: `Купить обрезки (${CRAFT_SCRAP_COST} адены)`,
    flag: '_craft_scrap',
    portrait: 'work',
  },
  {
    id: 'craft_bellows',
    label: 'Качать меха у горна',
    flag: '_craft_bellows',
    blocks: [CRAFT_BELLOWS_COMPLETE_FLAG],
    portrait: 'work',
  },
];

const MENU_ORDER = [
  'craft_scrap',
  'craft_bellows',
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
];

function isCraftChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'craft_bellows') {
    return !hasHavenFlag(save, CRAFT_BELLOWS_COMPLETE_FLAG);
  }
  return true;
}

export function citizenCraftMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter((choice) => isCraftChoiceVisible(choice, save));
}

function craftGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  const formatted = formatCitizenGreeting(npc.defaultGreeting, save);
  const bellowsDone = hasHavenFlag(save, CRAFT_BELLOWS_COMPLETE_FLAG);
  const hint = bellowsDone
    ? `Обрезки с горна — ${CRAFT_SCRAP_COST} адены за горсть.`
    : `Мехи просят рук — смена стоит выносливости, но платят. Обрезки — ${CRAFT_SCRAP_COST} адены.`;
  return {
    text: `${formatted.text}\n\n${hint}`,
    portrait: formatted.mood !== 'neutral' ? formatted.mood : 'neutral',
  };
}

export function generateCitizenCraftDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== CRAFT_NPC_ID) return null;
  const greeting = craftGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, citizenCraftMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: CitizenCraftResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, citizenCraftMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function applyCitizenCraftChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== CRAFT_NPC_ID) return null;
  if (isCitizenDialogueFallthrough(choiceId)) return null;

  if (choiceId === 'craft_scrap') {
    return followUpFromResult(npc, buyCraftScrap(save), 'work');
  }
  if (choiceId === 'craft_bellows') {
    return followUpFromResult(npc, pumpCraftBellows(save), 'happy');
  }

  return null;
}
