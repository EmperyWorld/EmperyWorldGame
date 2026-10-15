/**
 * Dialogue plugin for Кузнец Гарольд (town_blacksmith).
 * Mechanic ids: forge_sharpen / forge_whetstone.
 * Armor shop / forge UI / leave return null — parent and client keep forge_armor / forge_open.
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
  FORGE_SHARPEN_COST,
  FORGE_WHETSTONE_COST,
  SMITH_NPC_ID,
  smithBuyWhetstone,
  smithSharpen,
  type SmithSharpenResult,
} from './smith-sharpen.js';

export const BOARD_BOUNTY_COMPLETE_FLAG = 'quest_board_bounty_complete';

const YAML_FALLTHROUGH_IDS = new Set(['forge_armor', 'forge_open', 'forge_leave']);

const SMITH_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'forge_sharpen',
    label: `Заточить клинок (${FORGE_SHARPEN_COST} адены)`,
    flag: '_forge_sharpen',
    portrait: 'work',
  },
  {
    id: 'forge_whetstone',
    label: `Купить оселок (${FORGE_WHETSTONE_COST} адены)`,
    flag: '_forge_whetstone',
    portrait: 'work',
  },
];

const MENU_ORDER = [
  'forge_armor',
  'forge_open',
  'forge_sharpen',
  'forge_whetstone',
  'forge_leave',
];

function smithMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  for (const extra of SMITH_EXTRAS) {
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

function smithGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (hasHavenFlag(save, BOARD_BOUNTY_COMPLETE_FLAG)) {
    return {
      text: 'Слышал, ты знатно проредил чудовищ в предместьях! Оружие выдержало бой? Если лезвие затупилось — самое время перековать!',
      portrait: 'happy',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: SmithSharpenResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  const menu = generateSmithDialogue(npc, result.save);
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

export function generateSmithDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== SMITH_NPC_ID) return null;
  const greeting = smithGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, smithMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

export function applySmithChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== SMITH_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'forge_sharpen') {
    return followUpFromResult(npc, smithSharpen(save), 'work');
  }
  if (choiceId === 'forge_whetstone') {
    return followUpFromResult(npc, smithBuyWhetstone(save), 'work');
  }
  return null;
}

export const smithSharpenPlugin: HavenNpcFeaturePlugin = {
  generate: generateSmithDialogue,
  apply: applySmithChoice,
};
