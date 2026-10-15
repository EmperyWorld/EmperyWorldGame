/**
 * Dialogue plugin for Трактирщик Олег (town_innkeeper_day).
 * Mechanic ids: oleg_lunch / oleg_news.
 * Dice / rest / fish / provisions stay on DialogueService — apply returns null.
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
  FISH_QUEST_ACTIVE_FLAG,
  FISH_QUEST_DELIVERED_FLAG,
} from './haven-services.js';
import {
  OLEG_LUNCH_COST,
  OLEG_NPC_ID,
  serveOlegLunch,
  type OlegLunchResult,
} from './oleg-lunch.js';

/** Inn actions the parent already implements — never intercept. */
const YAML_FALLTHROUGH_IDS = new Set([
  'inn_fish_delivery',
  'inn_provisions',
  'inn_rest',
  'inn_dice',
  'inn_dice_10',
  'inn_dice_25',
  'inn_dice_50',
  'inn_dice_leave',
  'inn_day',
  'inn_leave',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'oleg_lunch',
    label: `Дневной обед (${OLEG_LUNCH_COST} адены)`,
    flag: '_oleg_lunch',
    portrait: 'happy',
  },
  {
    id: 'oleg_news',
    label: 'Что слышно за дневную смену?',
    flag: '_oleg_news',
    portrait: 'happy',
  },
];

const MENU_ORDER = [
  'inn_fish_delivery',
  'inn_provisions',
  'oleg_lunch',
  'inn_rest',
  'inn_dice',
  'oleg_news',
  'inn_day',
  'inn_leave',
];

const OLEG_NEWS_TEXT =
  'Днём у стойки тише, чем ночью у Марты. Стража меняется к полудню, рыбаки несут улов, ' +
  'а к закату я сдаю ключи — очаг не гаснет, просто меняется рука.';

function olegMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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
  return filterHavenChoices(ordered, save).filter((choice) => {
    if (choice.id === 'inn_fish_delivery') {
      return Boolean(save.questFlags[FISH_QUEST_ACTIVE_FLAG]) && !save.questFlags[FISH_QUEST_DELIVERED_FLAG];
    }
    return true;
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: OlegLunchResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, olegMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function generateOlegLunchDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== OLEG_NPC_ID) return null;
  return withDialogueScene(npc, {
    text: npc.defaultGreeting,
    choices: mapDialogueChoices(npc, olegMenuChoices(npc, save)),
    portrait: 'neutral',
  });
}

export function applyOlegLunchChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== OLEG_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'oleg_lunch') {
    return followUpFromResult(npc, serveOlegLunch(save), 'happy');
  }

  if (choiceId === 'oleg_news') {
    return {
      save,
      townMessage: OLEG_NEWS_TEXT,
      followUp: withDialogueScene(npc, {
        text: OLEG_NEWS_TEXT,
        choices: mapDialogueChoices(npc, olegMenuChoices(npc, save)),
        portrait: 'happy',
      }),
    };
  }

  return null;
}

export const olegLunchPlugin: HavenNpcFeaturePlugin = {
  generate: generateOlegLunchDialogue,
  apply: applyOlegLunchChoice,
};
