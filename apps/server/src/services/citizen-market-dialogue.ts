/**
 * Dialogue plugin for haven_citizen_market (Торговец Гавани).
 * Mechanic ids: citizen_market_pie / citizen_market_shift.
 * Flavor ids citizen_rumors / citizen_advice / citizen_leave fall through to YAML/DialogueService.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import { formatCitizenGreeting } from './citizen-rumors.js';
import {
  filterHavenChoices,
  hasHavenFlag,
  isCitizenDialogueFallthrough,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  MARKET_CITIZEN_NPC_ID,
  MARKET_PIE_COST,
  MARKET_SHIFT_COMPLETE_FLAG,
  buyMarketPie,
  helpMarketShift,
  type CitizenMarketResult,
} from './citizen-market.js';

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  {
    id: 'citizen_market_pie',
    label: `Купить пирог (${MARKET_PIE_COST} адены)`,
    flag: '_cit_market_pie',
    portrait: 'happy',
  },
  {
    id: 'citizen_market_shift',
    label: 'Помочь у прилавка',
    flag: '_cit_market_shift',
    blocks: [MARKET_SHIFT_COMPLETE_FLAG],
    portrait: 'serious',
  },
];

const MENU_ORDER = [
  'citizen_market_pie',
  'citizen_market_shift',
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
];

function isMarketChoiceVisible(choice: HavenNpcChoice, save: PlayerSave): boolean {
  if (choice.id === 'citizen_market_shift') {
    return !hasHavenFlag(save, MARKET_SHIFT_COMPLETE_FLAG);
  }
  return true;
}

export function marketMenuChoices(npc: HavenNpcLike, save: PlayerSave): HavenNpcChoice[] {
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

  return filterHavenChoices(ordered, save).filter((choice) => isMarketChoiceVisible(choice, save));
}

function marketGreeting(npc: HavenNpcLike, save: PlayerSave): { text: string; portrait: string } {
  const formatted = formatCitizenGreeting(npc.defaultGreeting, save);
  const shiftDone = hasHavenFlag(save, MARKET_SHIFT_COMPLETE_FLAG);
  const hint = shiftDone
    ? `Пирог с противня всё ещё тёплый — ${MARKET_PIE_COST} адены за кусок.`
    : `Прилавок трещит от покупателей — помоги с рядом, отсыплю адены. Пирог с противня — ${MARKET_PIE_COST} монет.`;
  return {
    text: `${formatted.text}\n\n${hint}`,
    portrait: formatted.mood !== 'neutral' ? formatted.mood : 'neutral',
  };
}

export function generateCitizenMarketDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
): DialogueResponse | null {
  if (npc.id !== MARKET_CITIZEN_NPC_ID) return null;
  const greeting = marketGreeting(npc, save);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, marketMenuChoices(npc, save)),
    portrait: greeting.portrait,
  });
}

function followUpFromResult(
  npc: HavenNpcLike,
  result: CitizenMarketResult,
  portrait: string,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, marketMenuChoices(npc, result.save)),
      portrait: result.ok ? portrait : 'serious',
    }),
  };
}

export function applyCitizenMarketChoice(
  npc: HavenNpcLike,
  save: PlayerSave,
  choiceId: string,
): HavenNpcChoiceResult | null {
  if (npc.id !== MARKET_CITIZEN_NPC_ID) return null;
  if (isCitizenDialogueFallthrough(choiceId)) return null;

  if (choiceId === 'citizen_market_pie') {
    return followUpFromResult(npc, buyMarketPie(save), 'happy');
  }
  if (choiceId === 'citizen_market_shift') {
    return followUpFromResult(npc, helpMarketShift(save), 'happy');
  }

  return null;
}
