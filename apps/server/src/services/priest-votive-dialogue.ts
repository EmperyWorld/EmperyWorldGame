/**
 * Dialogue plugin for Отец Кассий (town_priest).
 * Mechanic ids: priest_candle / priest_alms.
 * Bless/confess/lore stay with the parent (haven-services + YAML nextNode).
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
  PRIEST_ALMS_COST,
  PRIEST_CANDLE_COST,
  PRIEST_NPC_ID,
  buyCassiusCandle,
  givePriestAlms,
  type PriestVotiveResult,
} from './priest-votive.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'priest_bless',
  'priest_confess',
  'priest_lore',
  'priest_night',
  'priest_leave',
  'priest_lore_bye',
]);

const VOTIVE_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'priest_candle',
    label: `Купить храмовую свечу (${PRIEST_CANDLE_COST} адены)`,
    flag: '_priest_candle',
    portrait: 'happy',
  },
  {
    id: 'priest_alms',
    label: `Подать милостыню (${PRIEST_ALMS_COST} адены)`,
    flag: '_priest_alms',
    portrait: 'serious',
  },
];

const MENU_ORDER = [
  'priest_bless',
  'priest_confess',
  'priest_candle',
  'priest_alms',
  'priest_lore',
  'priest_night',
  'priest_leave',
];

function isPriestConfessVisible(save: PlayerSave): boolean {
  return (save.karma ?? 0) > 0;
}

function priestMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  for (const extra of VOTIVE_EXTRAS) {
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

  return filterHavenChoices(ordered, save).filter((choice) => {
    if (choice.id === 'priest_confess') return isPriestConfessVisible(save);
    return true;
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: PriestVotiveResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  const menu = generatePriestVotiveDialogue(npc, result.save);
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

export function generatePriestVotiveDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== PRIEST_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, priestMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

export function applyPriestVotiveChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== PRIEST_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'priest_candle') {
    return followUpFromResult(npc, buyCassiusCandle(save), 'happy');
  }
  if (choiceId === 'priest_alms') {
    return followUpFromResult(npc, givePriestAlms(save), 'serious');
  }
  return null;
}

export const priestVotivePlugin: HavenNpcFeaturePlugin = {
  generate: generatePriestVotiveDialogue,
  apply: applyPriestVotiveChoice,
};
