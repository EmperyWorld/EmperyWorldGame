/**
 * Dialogue plugin for Дворецкий Эдмунд (town_steward).
 * Mechanic: steward_rest. Buy/enter stay client-intercepted; leave is YAML.
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
import { loadHousingConfig } from './housing.js';
import {
  TENANT_REST_COST,
  tenantRest,
  type StewardRestResult,
} from './steward-rest.js';

export const STEWARD_NPC_ID = 'town_steward';

const YAML_PASSTHROUGH = new Set([
  'steward_buy_1',
  'steward_buy_2',
  'steward_buy_3',
  'steward_enter',
  'steward_leave',
]);

const REST_CHOICE: HavenNpcChoice = {
  id: 'steward_rest',
  label: `Отдохнуть у печи жильцов (${TENANT_REST_COST} адены)`,
  flag: '_steward_rest',
  portrait: 'happy',
};

const MENU_ORDER = [
  'steward_buy_1',
  'steward_buy_2',
  'steward_buy_3',
  'steward_enter',
  'steward_rest',
  'steward_leave',
];

function isStewardNpc(npc: HavenNpcLike): boolean {
  return npc.id === STEWARD_NPC_ID || npc.id === loadHousingConfig().stewardNpcId;
}

/** Replicates DialogueService.generate filters for buy/enter by housing.tier. */
export function filterStewardChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  if (!byId.has(REST_CHOICE.id)) {
    byId.set(REST_CHOICE.id, REST_CHOICE);
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

  const tier = save.housing?.tier ?? 0;
  return filterHavenChoices(ordered, save).filter((choice) => {
    if (choice.id === 'steward_enter') return Boolean(save.housing);
    if (choice.id === 'steward_buy_1') return tier < 1;
    if (choice.id === 'steward_buy_2') return tier < 2;
    if (choice.id === 'steward_buy_3') return tier < 3;
    return true;
  });
}

function stewardGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  const tier = save.housing?.tier ?? 0;
  const owned =
    tier > 0
      ? ` У тебя сейчас ${tier}-комнатная.`
      : ' Квартиры пока нет — могу продать ключ.';
  return {
    text: `${npc.defaultGreeting}${owned}`,
    portrait: tier > 0 ? 'happy' : 'neutral',
  };
}

export function generateStewardDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (!isStewardNpc(npc)) return null;
  const greeting = stewardGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, filterStewardChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(npc: HavenNpcLike, result: StewardRestResult): HavenNpcChoiceResult {
  const menu = generateStewardDialogue(npc, result.save);
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: menu?.choices ?? mapDialogueChoices(npc, filterStewardChoices(npc, result.save)),
      portrait: result.ok ? 'happy' : 'serious',
    }),
  };
}

/**
 * Only steward_rest is handled here.
 * Buy/enter/leave MUST return null so client intercepts and YAML flags still work.
 */
export function applyStewardChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (!isStewardNpc(npc)) return null;
  if (YAML_PASSTHROUGH.has(choiceId) || choiceId.endsWith('_bye')) return null;
  if (choiceId !== 'steward_rest') return null;
  return followUpFromResult(npc, tenantRest(save));
}

export const stewardRestPlugin: HavenNpcFeaturePlugin = {
  generate: generateStewardDialogue,
  apply: applyStewardChoice,
};
