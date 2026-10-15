/**
 * Dialogue plugin for Пивовар Хольм (town_brewer).
 * Mechanic ids: brew_tasting / brew_toast. Flavor ids brew_taste / brew_craft stay YAML.
 * Keep brew_shop exactly — client opens the brew shop on that choice id.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import {
  filterHavenChoices,
  type HavenNpcChoiceResult,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  brewTastingCount,
  buyHolmToast,
  HOLM_TOAST_COST,
  isHolmToastFree,
  tasteHolmAle,
} from './brewery-tasting.js';

const BREWER_NPC_ID = 'town_brewer';

const YAML_PASSTHROUGH = new Set([
  'brew_taste',
  'brew_craft',
  'brew_leave',
  'brew_taste_bye',
  'brew_craft_bye',
]);

function greetingFor(npc: HavenNpcLike, save: PlayerSave): string {
  const count = brewTastingCount(save);
  if (count <= 0) return npc.defaultGreeting;
  return `${npc.defaultGreeting}\n\nПена на стенках кружки не врёт: ты пробовал мои партии уже ${count} раз.`;
}

function menuChoices(npc: HavenNpcLike, save: PlayerSave) {
  return filterHavenChoices(npc.choices, save).map((choice) => {
    if (choice.id === 'brew_toast' && isHolmToastFree(save)) {
      return { ...choice, label: 'Тост за Гавань (в дар за дегустации)' };
    }
    if (choice.id === 'brew_toast') {
      return { ...choice, label: `Тост за Гавань (${HOLM_TOAST_COST} адены)` };
    }
    return choice;
  });
}

export function generateBrewerDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== BREWER_NPC_ID) return null;
  const count = brewTastingCount(save);
  return withDialogueScene(npc, {
    text: greetingFor(npc, save),
    choices: mapDialogueChoices(npc, menuChoices(npc, save)),
    portrait: count > 0 ? 'happy' : 'neutral',
  });
}

export function applyBrewerChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== BREWER_NPC_ID) return null;
  if (YAML_PASSTHROUGH.has(choiceId) || choiceId.endsWith('_bye')) return null;

  if (choiceId === 'brew_shop') {
    return { save };
  }

  if (choiceId === 'brew_tasting') {
    const result = tasteHolmAle(save);
    const menu = generateBrewerDialogue(npc, result.save);
    return {
      save: result.save,
      townMessage: result.message,
      followUp: withDialogueScene(npc, {
        text: result.message,
        choices: menu?.choices ?? [],
        portrait: result.ok ? 'happy' : 'serious',
      }),
    };
  }

  if (choiceId === 'brew_toast') {
    const result = buyHolmToast(save);
    const menu = generateBrewerDialogue(npc, result.save);
    return {
      save: result.save,
      townMessage: result.message,
      followUp: withDialogueScene(npc, {
        text: result.message,
        choices: menu?.choices ?? [],
        portrait: result.ok ? 'happy' : 'serious',
      }),
    };
  }

  return null;
}
