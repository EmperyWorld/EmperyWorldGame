/**
 * Dialogue plugin for Конюх Борис (town_stable).
 * Wire from DialogueService — do not import this from dialogue.ts until the owner merges it.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { MOUNT_STAMINA_MAX } from '@empery/shared';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  filterHavenChoices,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { normalizeMountState } from './mounts.js';
import {
  STABLE_STAMINA_RESTED,
  stableBuyHay,
  stableFeedMount,
  stableGroomMount,
  type StableCareResult,
} from './stable-care.js';

const NPC_ID = 'town_stable';

const SERVICE_CHOICES: HavenNpcChoice[] = [
  {
    id: 'stable_groom',
    label: 'Вычистить копыта (15 адены)',
    flag: '_stable_groom',
    portrait: 'work',
  },
  {
    id: 'stable_feed',
    label: 'Накормить сеном (охапка или 8 адены)',
    flag: '_stable_feed',
    portrait: 'happy',
  },
  {
    id: 'stable_buy_hay',
    label: 'Купить охапку сена (6 адены)',
    flag: '_stable_buy_hay',
    portrait: 'work',
  },
];

function menuChoices(npc: HavenNpcLike): HavenNpcChoice[] {
  const yaml = npc.choices ?? [];
  const have = new Set(yaml.map((c) => c.id));
  const missing = SERVICE_CHOICES.filter((c) => !have.has(c.id));
  if (missing.length === 0) return yaml;
  const leaveIdx = yaml.findIndex((c) => c.id === 'stable_leave');
  if (leaveIdx < 0) return [...missing, ...yaml];
  return [...yaml.slice(0, leaveIdx), ...missing, ...yaml.slice(leaveIdx)];
}

function greetingFor(save: PlayerSave): { text: string; portrait: string } {
  const mount = normalizeMountState(save.mount);
  if (!mount.ownedId) {
    return {
      text: 'Стойло пустует — нет у тебя лошади. Купи скакуна у Бориса, тогда уж и сеном накормим, и копыта вычистим.',
      portrait: 'neutral',
    };
  }
  const stamina = mount.stamina;
  const rested = stamina >= STABLE_STAMINA_RESTED;
  if (rested) {
    return {
      text: `Скакун отдохнул — выносливость ${stamina} из ${MOUNT_STAMINA_MAX}. Копыта в порядке, но щётка и сено всегда кстати.`,
      portrait: 'happy',
    };
  }
  return {
    text: `Твой скакун устал — выносливость ${stamina} из ${MOUNT_STAMINA_MAX}. Дай отдохнуть: вычищу копыта или брошу сена.`,
    portrait: 'work',
  };
}

function careFollowUp(npc: HavenNpcLike, result: StableCareResult): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, [
        {
          id: 'stable_leave',
          label: result.ok ? 'Благодарю.' : 'Понял.',
          flag: '_stable_done',
          portrait: result.ok ? 'happy' : 'serious',
        },
      ]),
      portrait: result.ok ? 'happy' : 'serious',
    }),
  };
}

/** Menu for town_stable only. Other NPCs → null. */
export function generateStableDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null {
  if (npc.id !== NPC_ID) return null;
  const greeting = greetingFor(save);
  const choices = filterHavenChoices(menuChoices(npc), save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, choices),
    portrait: greeting.portrait,
  });
}

/**
 * Service choices return a result. Flavor YAML choices (mount/charge/puppy/leave and *_bye)
 * return null so DialogueService nextNode still works.
 */
export function applyStableChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== NPC_ID) return null;
  if (choiceId === 'stable_shop') return { save };
  if (choiceId === 'stable_groom') return careFollowUp(npc, stableGroomMount(save));
  if (choiceId === 'stable_feed') return careFollowUp(npc, stableFeedMount(save));
  if (choiceId === 'stable_buy_hay') return careFollowUp(npc, stableBuyHay(save));
  return null;
}
