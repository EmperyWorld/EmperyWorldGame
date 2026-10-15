/**
 * Dialogue plugin for Связист Рен (town_radio).
 * Mechanic ids: radio_broadcast / radio_signal. radio_shop returns { save } for client shop.
 * Flavor ids radio_howto / radio_static / radio_shop_done / *_bye stay YAML.
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
import { emptyRadioState, hasFieldRadio, normalizeRadioState } from './radio.js';
import {
  HAVEN_BROADCAST_COST,
  radioSignalCheck,
  roughRadioChargeLabel,
  tuneHavenBroadcast,
  type RadioBroadcastResult,
} from './radio-broadcast.js';

export const RADIO_NPC_ID = 'town_radio';

const YAML_PASSTHROUGH = new Set([
  'radio_howto',
  'radio_static',
  'radio_shop_done',
  'radio_howto_bye',
  'radio_static_bye',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  { id: 'radio_shop', label: 'Купить батареи', flag: '_radio_shop', portrait: 'happy' },
  {
    id: 'radio_broadcast',
    label: `Поймать эфир Гавани (${HAVEN_BROADCAST_COST} адены)`,
    flag: '_radio_broadcast',
    portrait: 'work',
  },
  { id: 'radio_signal', label: 'Проверить сигнал', flag: '_radio_signal', portrait: 'serious' },
];

const MENU_ORDER = [
  'radio_shop',
  'radio_broadcast',
  'radio_signal',
  'radio_howto',
  'radio_static',
  'radio_shop_done',
];

function menuChoices(npc: HavenNpcLike): HavenNpcChoice[] {
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
  return ordered;
}

function greetingFor(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  const radio = save.radio ? normalizeRadioState(save.radio) : emptyRadioState();
  if (radio.broken) {
    return {
      text: 'Корпус мёртвый — чиню за 100000 adena, потом батареи. Эфир пока кручу с мачты.',
      portrait: 'serious',
    };
  }
  if (radio.sessionExpiresAt) {
    const charge = roughRadioChargeLabel(radio.sessionExpiresAt);
    const power = radio.powerOn ? 'включена' : 'выключена';
    return {
      text: `Твоя рация ${power}, ${charge}. Батареи у меня. Хочешь городской эфир с мачты?`,
      portrait: 'work',
    };
  }
  if (hasFieldRadio(save)) {
    return { text: npc.defaultGreeting, portrait: 'neutral' };
  }
  return {
    text: 'Рации нет — купи у меня батареи и корпус. Пока могу настроить городской эфир с мачты.',
    portrait: 'happy',
  };
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: RadioBroadcastResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  const menu = generateRadioBroadcastDialogue(npc, result.save);
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

export function generateRadioBroadcastDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== RADIO_NPC_ID) return null;
  const scene = greetingFor(npc, save);
  return withDialogueScene(npc, {
    text: scene.text,
    choices: mapDialogueChoices(npc, filterHavenChoices(menuChoices(npc), save)),
    portrait: scene.portrait,
  });
}

export function applyRadioBroadcastChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== RADIO_NPC_ID) return null;
  if (YAML_PASSTHROUGH.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'radio_shop') {
    return { save };
  }
  if (choiceId === 'radio_broadcast') {
    return followUpFromResult(npc, tuneHavenBroadcast(save), 'work');
  }
  if (choiceId === 'radio_signal') {
    return followUpFromResult(npc, radioSignalCheck(save), 'serious');
  }
  return null;
}

export const radioBroadcastPlugin: HavenNpcFeaturePlugin = {
  generate: generateRadioBroadcastDialogue,
  apply: applyRadioBroadcastChoice,
};
