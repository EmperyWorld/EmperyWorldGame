import type { DialogueResponse, PlayerSave } from '@empery/shared';
import {
  EQUIPMENT_SLOTS,
  enchantCost,
  formatEnchantChance,
  getEquipmentEnchant,
  isEnchantableSlot,
  MAX_ENCHANT,
  enchantSuccessRate,
} from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { mapDialogueChoices, withDialogueScene, type NpcPortraits } from './dialogue-portraits.js';
import { craftChoiceLabel, getCraftRecipe, loadCraftRecipes } from './town-services.js';

const SLOT_LABELS: Record<string, string> = {
  weapon: 'Оружие',
  weapon2: '2-й клинок',
  shield: 'Щит',
  head: 'Шлем',
  body: 'Доспех',
  legs: 'Сапоги',
  gloves: 'Перчатки',
  cloak: 'Плащ',
};

export interface TownActionResult {
  save: PlayerSave;
  message: string;
  ok: boolean;
}

export interface ForgeEnchantOffer {
  slot: string;
  slotLabel: string;
  itemId: string;
  itemName: string;
  level: number;
  maxed: boolean;
  cost: number;
  chance: string;
  affordable: boolean;
}

export interface ForgeCraftOffer {
  id: string;
  name: string;
  resultId: string;
  resultName: string;
  ingredients: Array<{ id: string; name: string; need: number; have: number }>;
  canCraft: boolean;
}

export interface ForgeMenuState {
  smithName: string;
  adena: number;
  hint: string;
  enchant: ForgeEnchantOffer[];
  craft: ForgeCraftOffer[];
}

export function blacksmithSlotFromChoice(choiceId: string): string | null {
  if (!choiceId.startsWith('forge_') || choiceId === 'forge_leave') return null;
  const slot = choiceId.slice('forge_'.length);
  return isEnchantableSlot(slot) ? slot : null;
}

function forgeChoiceLabel(save: PlayerSave, slot: string): string | null {
  const itemId = save.equipment[slot];
  if (!itemId) return null;

  const item = getItem(itemId);
  if (!item || !isEnchantableSlot(item.slot)) return null;

  const level = getEquipmentEnchant(save.equipmentEnchants, slot);
  if (level >= MAX_ENCHANT) {
    return `${SLOT_LABELS[slot] ?? slot}: ${item.name} +${level} (макс.)`;
  }

  const cost = enchantCost(level);
  const chance = formatEnchantChance(level);
  const next = level + 1;
  return `${SLOT_LABELS[slot] ?? slot}: ${item.name} +${level}→+${next} — ${cost} adena (${chance})`;
}

/** Structured forge menu for the client UI. */
export function buildForgeMenu(save: PlayerSave): ForgeMenuState {
  const adena = save.adena ?? 0;
  const enchant: ForgeEnchantOffer[] = [];

  for (const slot of EQUIPMENT_SLOTS) {
    if (!isEnchantableSlot(slot)) continue;
    const itemId = save.equipment[slot];
    if (!itemId) continue;
    const item = getItem(itemId);
    if (!item || !isEnchantableSlot(item.slot)) continue;
    const level = getEquipmentEnchant(save.equipmentEnchants, slot);
    const maxed = level >= MAX_ENCHANT;
    const cost = maxed ? 0 : enchantCost(level);
    enchant.push({
      slot,
      slotLabel: SLOT_LABELS[slot] ?? slot,
      itemId,
      itemName: item.name,
      level,
      maxed,
      cost,
      chance: maxed ? '—' : formatEnchantChance(level),
      affordable: !maxed && adena >= cost,
    });
  }

  const craft: ForgeCraftOffer[] = loadCraftRecipes().map((recipe) => {
    const result = getItem(recipe.result);
    const ingredients = Object.entries(recipe.ingredients).map(([id, need]) => {
      const have = save.inventory.filter((x) => x === id).length;
      return {
        id,
        name: getItem(id)?.name ?? id,
        need,
        have,
      };
    });
    return {
      id: recipe.id,
      name: recipe.name,
      resultId: recipe.result,
      resultName: result?.name ?? recipe.result,
      ingredients,
      canCraft: ingredients.every((ing) => ing.have >= ing.need),
    };
  });

  return {
    smithName: 'Кузнец Гарольд',
    adena,
    hint: 'Надень экип для заточки. До +3 без риска; с +4 шанс падает и при провале сброс до +0.',
    enchant,
    craft,
  };
}

export function buildBlacksmithDialogue(
  save: PlayerSave,
  npc: { id: string; name: string; portraits?: NpcPortraits },
): DialogueResponse {
  const menu = buildForgeMenu(save);
  const rawChoices: Array<{ id: string; label: string; portrait?: string }> = [];

  for (const row of menu.enchant) {
    if (row.maxed) continue;
    const label = forgeChoiceLabel(save, row.slot);
    if (!label) continue;
    rawChoices.push({ id: `forge_${row.slot}`, label });
  }

  for (const recipe of menu.craft) {
    const full = getCraftRecipe(recipe.id);
    if (!full) continue;
    rawChoices.push({
      id: recipe.id,
      label: `Крафт: ${craftChoiceLabel(save, full)}`,
      portrait: 'work',
    });
  }

  rawChoices.push({ id: 'forge_leave', label: 'Уйти', portrait: 'neutral' });

  return withDialogueScene(npc, {
    text: menu.hint,
    choices: mapDialogueChoices(npc, rawChoices),
    portrait: 'work',
  });
}

export function enchantAtBlacksmith(save: PlayerSave, slot: string): TownActionResult {
  if (!isEnchantableSlot(slot)) {
    return { save, ok: false, message: 'Этот слот нельзя точить.' };
  }

  const itemId = save.equipment[slot];
  if (!itemId) {
    return { save, ok: false, message: 'Слот пуст — надень предмет.' };
  }

  const item = getItem(itemId);
  if (!item) {
    return { save, ok: false, message: 'Предмет не найден.' };
  }

  const eqEnchants = { ...save.equipmentEnchants };
  const current = eqEnchants[slot] ?? 0;

  if (current >= MAX_ENCHANT) {
    return { save, ok: false, message: `${item.name} уже +${MAX_ENCHANT} — выше не поднять.` };
  }

  const cost = enchantCost(current);
  const adena = save.adena ?? 0;
  if (adena < cost) {
    return { save, ok: false, message: `Не хватает adena. Нужно ${cost}, у тебя ${adena}.` };
  }

  const success = Math.random() < enchantSuccessRate(current);
  const nextLevel = success ? current + 1 : 0;
  eqEnchants[slot] = nextLevel;

  const next = applyStatsToSave({
    ...save,
    adena: adena - cost,
    equipmentEnchants: eqEnchants,
  });

  const label = item.name;
  if (success) {
    const bonus =
      nextLevel >= 4
        ? slot === 'weapon'
          ? ' (усиленный бонус P.Atk)'
          : ' (усиленный P.Def и HP)'
        : '';
    return {
      save: next,
      ok: true,
      message: `Успех! ${label} теперь +${nextLevel}${bonus}. (−${cost} adena)`,
    };
  }

  return {
    save: next,
    ok: false,
    message: `Заточка не удалась! ${label} сброшен до +0. (−${cost} adena)`,
  };
}
