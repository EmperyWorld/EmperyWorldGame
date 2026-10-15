/**
 * Dialogue plugin for town_merchant (Торговец Лорен).
 * DialogueService wires generateMerchantDialogue / applyMerchantChoice.
 * Client currently auto-opens the shop on talk — parent must stop that and intercept merchant_shop.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';
import {
  filterHavenChoices,
  type HavenNpcChoice,
  type HavenNpcChoiceResult,
  type HavenNpcLike,
} from './haven-npc-plugin.js';
import { mapDialogueChoices, withDialogueScene } from './dialogue-portraits.js';
import {
  buyDailyDeal,
  currentMerchantDeal,
  dealChoiceLabel,
  isMerchantDealClosed,
  MERCHANT_NPC_ID,
  type MerchantDealResult,
} from './merchant-deal.js';

const MENU_ORDER = ['merchant_shop', 'merchant_deal', 'browse_done', 'merchant_leave'];

const MECHANIC_EXTRAS: HavenNpcChoice[] = [
  { id: 'merchant_shop', label: 'Открыть лавку', flag: '_merchant_shop', portrait: 'happy' },
  { id: 'merchant_deal', label: 'Сделка дня', flag: '_merchant_deal', portrait: 'happy' },
  { id: 'browse_done', label: 'Уйти', flag: '_shop_done', portrait: 'neutral' },
];

function merchantMenuChoices(npc: HavenNpcLike, save: PlayerSave, now: Date): HavenNpcChoice[] {
  const deal = currentMerchantDeal(now);
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

  return filterHavenChoices(ordered, save).map((choice) => {
    if (choice.id === 'merchant_deal') {
      return { ...choice, label: dealChoiceLabel(deal) };
    }
    return choice;
  });
}

function merchantGreeting(
  npc: HavenNpcLike,
  save: PlayerSave,
  now: Date,
): { text: string; portrait: string } {
  const deal = currentMerchantDeal(now);
  const closed = isMerchantDealClosed(save, now);
  const dealLine = closed
    ? `Сделка дня была ${deal.label} за ${deal.price} адены — на сегодня закрыта.`
    : `Сделка дня: ${deal.label} за ${deal.price} адены — дешевле лавки. Один лот до полуночи по UTC.`;
  return {
    text: `${npc.defaultGreeting}\n\n${dealLine}`,
    portrait: closed ? 'neutral' : 'happy',
  };
}

export function generateMerchantDialogue(
  npc: HavenNpcLike,
  save: PlayerSave,
  now: Date = new Date(),
): DialogueResponse | null {
  if (npc.id !== MERCHANT_NPC_ID) return null;
  const greeting = merchantGreeting(npc, save, now);
  return withDialogueScene(npc, {
    text: greeting.text,
    choices: mapDialogueChoices(npc, merchantMenuChoices(npc, save, now)),
    portrait: greeting.portrait,
  });
}

function followUpFromDeal(
  npc: HavenNpcLike,
  result: MerchantDealResult,
  now: Date,
): HavenNpcChoiceResult {
  return {
    save: result.save,
    townMessage: result.message,
    followUp: withDialogueScene(npc, {
      text: result.message,
      choices: mapDialogueChoices(npc, merchantMenuChoices(npc, result.save, now)),
      portrait: result.ok ? 'happy' : 'serious',
    }),
  };
}

export function applyMerchantChoice(
  save: PlayerSave,
  npc: HavenNpcLike,
  choiceId: string,
  now: Date = new Date(),
): HavenNpcChoiceResult | null {
  if (npc.id !== MERCHANT_NPC_ID) return null;

  if (choiceId === 'merchant_shop' || choiceId === 'browse_done' || choiceId === 'merchant_leave') {
    return { save };
  }

  if (choiceId === 'merchant_deal') {
    return followUpFromDeal(npc, buyDailyDeal(save, now), now);
  }

  return null;
}
