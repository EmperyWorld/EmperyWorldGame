/**
 * Dialogue plugin for Лекарь Сера (town_healer).
 * Mechanic ids: healer_kit / healer_long / healer_diagnose.
 * Shop/treat/flavor return null — client apothecary and treatAtNpc stay on the parent.
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
  HEALER_KIT_COST,
  HEALER_LONG_COST,
  HEALER_NPC_ID,
  healerDiagnose,
  healerFieldKit,
  healerLongCare,
  type HealerClinicResult,
} from './healer-clinic.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'healer_shop',
  'healer_treat',
  'healer_care',
  'healer_warn',
  'healer_night',
  'healer_leave',
]);

const CLINIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'healer_kit',
    label: `Купить полевой бинт (${HEALER_KIT_COST} адены)`,
    flag: '_healer_kit',
    portrait: 'work',
  },
  {
    id: 'healer_long',
    label: `Долгий уход (−${HEALER_LONG_COST} адены)`,
    flag: '_healer_long',
    portrait: 'happy',
  },
  {
    id: 'healer_diagnose',
    label: 'Осмотри раны',
    flag: '_healer_diagnose',
    portrait: 'serious',
  },
];

const MENU_ORDER = [
  'healer_shop',
  'healer_treat',
  'healer_kit',
  'healer_long',
  'healer_diagnose',
  'healer_care',
  'healer_warn',
  'healer_night',
  'healer_leave',
];

function clinicMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
  const byId = new Map<string, HavenNpcChoice>();
  for (const choice of npc.choices ?? []) {
    byId.set(choice.id, choice);
  }
  for (const extra of CLINIC_EXTRAS) {
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
  result: HealerClinicResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  const menu = generateHealerDialogue(npc, result.save);
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

export function generateHealerDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== HEALER_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, clinicMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

export function applyHealerChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== HEALER_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'healer_kit') {
    return followUpFromResult(npc, healerFieldKit(save), 'work');
  }
  if (choiceId === 'healer_long') {
    return followUpFromResult(npc, healerLongCare(save), 'happy');
  }
  if (choiceId === 'healer_diagnose') {
    return followUpFromResult(npc, healerDiagnose(save), 'serious');
  }
  return null;
}

export const healerClinicPlugin: HavenNpcFeaturePlugin = {
  generate: generateHealerDialogue,
  apply: applyHealerChoice,
};
