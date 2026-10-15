/**
 * Dialogue plugin for town_notice_board extras (copy + petition).
 * Replicates grove-bounty menu filters from DialogueService, then adds extras.
 * Bounty/news/guide/leave apply fall through (null) to notice-board.ts.
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
  BOARD_BOUNTY_ACTIVE_FLAG,
  BOARD_BOUNTY_COMPLETE_FLAG,
  BOARD_BOUNTY_KILLS_FLAG,
  BOARD_BOUNTY_TARGET_KILLS,
} from './notice-board.js';
import {
  copyBoardBulletin,
  fileBoardPetition,
  FORUM_PETITION_COMPLETE_FLAG,
  NOTICE_BOARD_NPC_ID,
  type NoticePetitionResult,
} from './notice-petition.js';

const YAML_FALLTHROUGH_IDS = new Set([
  'board_bounty_accept',
  'board_bounty_claim',
  'board_news',
  'board_guide',
  'board_leave',
]);

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'board_copy',
    label: 'Снять копию листовки: 6 адены',
    flag: '_board_copy',
    portrait: 'work',
  },
  {
    id: 'board_petition',
    label: 'Подать прошение магистрату: 15 адены',
    flag: '_board_petition',
    blocks: [FORUM_PETITION_COMPLETE_FLAG],
    portrait: 'serious',
  },
];

const MENU_ORDER = [
  'board_bounty_accept',
  'board_bounty_claim',
  'board_copy',
  'board_petition',
  'board_news',
  'board_guide',
  'board_leave',
];

function isBountyChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  const flags = save.questFlags;
  if (choice.id === 'board_bounty_accept') {
    return !flags[BOARD_BOUNTY_COMPLETE_FLAG] && !flags[BOARD_BOUNTY_ACTIVE_FLAG];
  }
  if (choice.id === 'board_bounty_claim') {
    return Boolean(flags[BOARD_BOUNTY_ACTIVE_FLAG]) && !flags[BOARD_BOUNTY_COMPLETE_FLAG];
  }
  return true;
}

function isPetitionVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'board_petition') {
    return !hasHavenFlag(save, FORUM_PETITION_COMPLETE_FLAG);
  }
  return true;
}

export function noticePetitionMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter(
    (choice) => isBountyChoiceVisible(choice, save) && isPetitionVisible(choice, save),
  );
}

function noticeGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  const flags = save.questFlags;
  const kills = Number(flags[BOARD_BOUNTY_KILLS_FLAG] ?? 0);
  if (flags[BOARD_BOUNTY_COMPLETE_FLAG]) {
    return {
      text: '[ГОРОДСКАЯ ДОСКА ОБЪЯВЛЕНИЙ ГАВАНИ]\nТекущий муниципальный контракт закрыт с почётом. Ожидаются новые разнарядки.',
      portrait: 'neutral',
    };
  }
  if (flags[BOARD_BOUNTY_ACTIVE_FLAG]) {
    return {
      text: `[ГОРОДСКАЯ ДОСКА ОБЪЯВЛЕНИЙ ГАВАНИ]\nАктивен контракт на зачистку подступов. Текущий прогресс: ${kills}/${BOARD_BOUNTY_TARGET_KILLS} целей.`,
      portrait: 'neutral',
    };
  }
  return { text: npc.defaultGreeting, portrait: 'neutral' };
}

export function generateNoticePetitionDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== NOTICE_BOARD_NPC_ID) return null;
  const greeting = noticeGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, noticePetitionMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: NoticePetitionResult,
  okPortrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, noticePetitionMenuChoices(npc, result.save)),
      portrait: result.ok ? okPortrait : 'serious',
    }),
  };
}

export function applyNoticePetitionChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== NOTICE_BOARD_NPC_ID) return null;
  if (YAML_FALLTHROUGH_IDS.has(choiceId)) return null;

  if (choiceId === 'board_copy') {
    return followUpFromResult(npc, copyBoardBulletin(save), 'work');
  }
  if (choiceId === 'board_petition') {
    return followUpFromResult(npc, fileBoardPetition(save), 'happy');
  }

  return null;
}

export const noticePetitionPlugin: HavenNpcFeaturePlugin = {
  generate: generateNoticePetitionDialogue,
  apply: applyNoticePetitionChoice,
};
