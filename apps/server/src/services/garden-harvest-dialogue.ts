/**
 * Dialogue plugin for town_gardener harvest cycle (Садовник Илья).
 * generate always owns the gardener menu so wiring it before the YAML block
 * does not hide garden_accept / garden_water. apply handles harvest ids only.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import { GARDEN_ACTIVE_FLAG, GARDEN_COMPLETE_FLAG } from './garden-quest.js';
import {
  GARDEN_HARVEST_ACTIVE_FLAG,
  GARDEN_HARVEST_COMPLETE_FLAG,
  acceptHarvest,
  claimHarvest,
  type GardenHarvestResult,
} from './garden-harvest.js';
import {
  filterHavenChoices,
  hasHavenFlag,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcFeaturePlugin,
  type HavenNpcLike,
} from './haven-npc-plugin.js';

export const GARDENER_NPC_ID = 'town_gardener';

const HARVEST_CHOICE_IDS = new Set(['garden_harvest_accept', 'garden_harvest_claim']);
const ORIGINAL_GARDEN_IDS = new Set(['garden_accept', 'garden_water', 'garden_leave']);

const HARVEST_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'garden_harvest_accept',
    label: 'Помочь с урожаем',
    flag: '_garden_harvest_accept',
    portrait: 'happy',
  },
  {
    id: 'garden_harvest_claim',
    label: 'Забрать урожай',
    flag: '_garden_harvest_claim',
    portrait: 'work',
  },
];

const MENU_ORDER = [
  'garden_accept',
  'garden_water',
  'garden_harvest_accept',
  'garden_harvest_claim',
  'garden_leave',
];

function isGardenChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  const gardenComplete = hasHavenFlag(save, GARDEN_COMPLETE_FLAG);
  const gardenActive = hasHavenFlag(save, GARDEN_ACTIVE_FLAG);
  const harvestActive = hasHavenFlag(save, GARDEN_HARVEST_ACTIVE_FLAG);
  const harvestComplete = hasHavenFlag(save, GARDEN_HARVEST_COMPLETE_FLAG);

  if (choice.id === 'garden_accept') return !gardenComplete && !gardenActive;
  if (choice.id === 'garden_water') return gardenActive && !gardenComplete;
  if (choice.id === 'garden_harvest_accept') {
    return gardenComplete && !harvestActive && !harvestComplete;
  }
  if (choice.id === 'garden_harvest_claim') return harvestActive && !harvestComplete;
  return true;
}

export function gardenHarvestMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  for (const extra of HARVEST_EXTRAS) {
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

  return filterHavenChoices(ordered, save).filter((choice) => isGardenChoiceVisible(choice, save));
}

function gardenerGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  if (hasHavenFlag(save, GARDEN_HARVEST_COMPLETE_FLAG)) {
    return {
      text: 'Урожай собран — спасибо. Капуста твоя, грядки отдыхают.',
      portrait: 'happy',
    };
  }
  if (hasHavenFlag(save, GARDEN_HARVEST_ACTIVE_FLAG)) {
    return {
      text: 'Кочаны срезаны. Забери урожай — два кочана и доля адены ждут.',
      portrait: 'work',
    };
  }
  if (hasHavenFlag(save, GARDEN_COMPLETE_FLAG)) {
    return {
      text: 'Грядки сытые, земля мягкая. Если снова понадобится рука — свистни.',
      portrait: 'happy',
    };
  }
  if (hasHavenFlag(save, GARDEN_ACTIVE_FLAG)) {
    return {
      text: 'Воды всё ещё жду. Колодец во дворе, фляги — у торговцев. Потом полей грядки.',
      portrait: 'serious',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

export function generateGardenHarvestDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== GARDENER_NPC_ID) return null;
  const greeting = gardenerGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, gardenHarvestMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromHarvest(
  npc: HavenNpcLike,
  result: GardenHarvestResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, gardenHarvestMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function applyGardenHarvestChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== GARDENER_NPC_ID) return null;
  if (ORIGINAL_GARDEN_IDS.has(choiceId)) return null;
  if (!HARVEST_CHOICE_IDS.has(choiceId)) return null;

  if (choiceId === 'garden_harvest_accept') {
    return followUpFromHarvest(npc, acceptHarvest(save), 'happy');
  }
  return followUpFromHarvest(npc, claimHarvest(save), 'happy');
}

export const gardenHarvestPlugin: HavenNpcFeaturePlugin = {
  generate: generateGardenHarvestDialogue,
  apply: applyGardenHarvestChoice,
};
