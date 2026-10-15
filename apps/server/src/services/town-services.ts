import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, parseAllDocuments } from 'yaml';
import type { PlayerSave } from '@empery/shared';
import { reconcileInventoryEntries } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getItem, loadItems, type ItemDefinition } from './items.js';
import { contentRoot } from './paths.js';
import {
  appendItemsToSave,
  removeInventoryIndexFromSave,
  removeItemIdsFromSave,
  setInventoryEntriesOnSave,
} from './inventory-bag.js';
import { applyRestRecovery, survivalOf } from './survival.js';
import { worldEvents } from './world-events.js';

const SELL_RATIO = 0.45;
const INN_REST_COST = 25;
const DEFAULT_SHOP_ID = 'haven_merchant';
const resolvedShopIds = new Map<string, string>();
const shopYamlCache = new Map<string, ShopYaml>();
let craftRecipesCache: CraftRecipe[] | null = null;
let craftRecipesById: Map<string, CraftRecipe> | null = null;

export function resolveShopId(raw?: string | null): string {
  const id = String(raw ?? DEFAULT_SHOP_ID).trim();
  if (!/^[a-z][a-z0-9_]*$/.test(id)) return DEFAULT_SHOP_ID;
  const cached = resolvedShopIds.get(id);
  if (cached) return cached;
  const path = join(contentRoot, `shops/${id}.yaml`);
  const resolved = existsSync(path) ? id : DEFAULT_SHOP_ID;
  resolvedShopIds.set(id, resolved);
  return resolved;
}

export interface TownActionResult {
  save: PlayerSave;
  message: string;
  ok: boolean;
}

export interface ShopOffer {
  item: ItemDefinition;
  price: number;
  sellPrice: number;
}

interface ShopYamlOffer {
  id: string;
  price: number;
  sellPrice?: number;
}

interface ShopYaml {
  merchantName?: string;
  offers: ShopYamlOffer[];
}

export interface CraftRecipe {
  id: string;
  name: string;
  result: string;
  ingredients: Record<string, number>;
}

function loadShopYaml(shopId = DEFAULT_SHOP_ID): ShopYaml {
  const resolved = resolveShopId(shopId);
  const cached = shopYamlCache.get(resolved);
  if (cached) return cached;
  const path = join(contentRoot, `shops/${resolved}.yaml`);
  const loaded = parseYaml(readFileSync(path, 'utf8')) as ShopYaml;
  shopYamlCache.set(resolved, loaded);
  return loaded;
}

export function getMerchantName(shopId = DEFAULT_SHOP_ID): string {
  return loadShopYaml(shopId).merchantName ?? 'Торговец';
}

function shopEntries(shopId = DEFAULT_SHOP_ID): ShopYamlOffer[] {
  return loadShopYaml(shopId).offers ?? [];
}

function shopBuyPrice(itemId: string, shopId = DEFAULT_SHOP_ID): number | undefined {
  return shopEntries(shopId).find((o) => o.id === itemId)?.price;
}

function shopSellPrice(itemId: string, shopId = DEFAULT_SHOP_ID): number | undefined {
  const entry = shopEntries(shopId).find((o) => o.id === itemId);
  if (!entry) return undefined;
  if (entry.sellPrice !== undefined) return entry.sellPrice;
  return Math.max(1, Math.floor(entry.price * SELL_RATIO));
}

/** Оценка продажи для предметов вне прайса лавки. */
export function estimateSellPrice(item: ItemDefinition): number {
  if (item.unsellable) return 0;
  const fromShop = shopSellPrice(item.id);
  if (fromShop !== undefined) return fromShop;

  const rarityBase: Record<string, number> = {
    common: 12,
    uncommon: 45,
    rare: 120,
    epic: 280,
    legendary: 600,
    daedric: 1200,
    holy: 2800,
  };
  let value = rarityBase[item.rarity] ?? 15;
  const s = item.stats ?? {};
  value += (s.pAtk ?? s.damage ?? 0) * 6;
  value += (s.pDef ?? s.defense ?? 0) * 5;
  value += (s.maxHp ?? 0) * 1.5;
  value += (s.accuracy ?? 0) * 3;
  value += (s.evasion ?? 0) * 3;
  value += (s.critRate ?? 0) * 8;
  value += (s.speed ?? 0) * 2;
  value += (s.attackSpeed ?? 0) * 2;
  if (item.slot === 'material') value = Math.max(4, Math.floor(value * 0.5));
  return Math.max(1, Math.floor(value));
}

export function listShopOffers(shopId = 'haven_merchant'): ShopOffer[] {
  const byId = new Map(loadItems().map((item) => [item.id, item]));
  const offers: ShopOffer[] = [];

  for (const entry of shopEntries(shopId)) {
    const item = byId.get(entry.id);
    if (!item) continue;
    const sellPrice =
      entry.sellPrice !== undefined
        ? entry.sellPrice
        : Math.max(1, Math.floor(entry.price * SELL_RATIO));
    offers.push({ item, price: entry.price, sellPrice: item.unsellable ? 0 : sellPrice });
  }

  return offers;
}

export function listBagSellQuotes(save: PlayerSave): Array<{
  inventoryIndex: number;
  item: ItemDefinition;
  sellPrice: number;
}> {
  const quotes: Array<{ inventoryIndex: number; item: ItemDefinition; sellPrice: number }> = [];
  for (let i = 0; i < save.inventory.length; i++) {
    const itemId = save.inventory[i]!;
    const item = getItem(itemId);
    if (!item || item.unsellable) continue;
    quotes.push({ inventoryIndex: i, item, sellPrice: estimateSellPrice(item) });
  }
  return quotes;
}

export function buyFromMerchant(
  save: PlayerSave,
  itemId: string,
  quantity = 1,
  shopId = 'haven_merchant',
): TownActionResult {
  const price = shopBuyPrice(itemId, shopId);
  if (price === undefined) {
    return { save, ok: false, message: 'Такого товара нет.' };
  }

  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty < 1) {
    return { save, ok: false, message: 'Укажи количество.' };
  }
  if (qty > 99) {
    return { save, ok: false, message: 'За раз можно купить не больше 99 шт.' };
  }

  if (itemId === 'field_radio') {
    return { save, ok: false, message: 'Рацию не продаю. Если сломалась — чиню за 100000 adena.' };
  }

  const total = price * qty;
  const adena = save.adena ?? 0;
  if (adena < total) {
    return {
      save,
      ok: false,
      message: `Не хватает adena. Нужно ${total} за ${qty} шт., у тебя ${adena}.`,
    };
  }

  const item = getItem(itemId);
  const label = item?.name ?? itemId;
  const added = Array.from({ length: qty }, () => itemId);
  const withBag = appendItemsToSave(save, added);
  const next = applyStatsToSave({
    ...withBag,
    adena: adena - total,
  });

  const msg =
    qty === 1
      ? `Куплено: ${label} (−${total} adena).`
      : `Куплено: ${label} ×${qty} (−${total} adena).`;
  return { save: next, ok: true, message: msg };
}

export function sellToMerchant(save: PlayerSave, inventoryIndex: number): TownActionResult {
  if (inventoryIndex < 0 || inventoryIndex >= save.inventory.length) {
    return { save, ok: false, message: 'Предмет не найден в рюкзаке.' };
  }

  const itemId = save.inventory[inventoryIndex]!;
  const item = getItem(itemId);
  if (!item) {
    return { save, ok: false, message: 'Неизвестный предмет.' };
  }
  if (item.unsellable) {
    return { save, ok: false, message: `${item.name} нельзя продать.` };
  }

  const price = estimateSellPrice(item);
  const removed = removeInventoryIndexFromSave(save, inventoryIndex);
  if (!removed) {
    return { save, ok: false, message: 'Предмет не найден в рюкзаке.' };
  }

  const next = applyStatsToSave({
    ...removed,
    adena: (save.adena ?? 0) + price,
  });

  return {
    save: next,
    ok: true,
    message: `Продано: ${item.name} (+${price} adena).`,
  };
}

/** Продать весь рюкзак (экипировка в equipment не трогается). */
export function sellAllBagToMerchant(save: PlayerSave): TownActionResult {
  if (save.inventory.length === 0) {
    return { save, ok: false, message: 'В рюкзаке нечего продавать.' };
  }

  let total = 0;
  let count = 0;
  const keptEntries: import('@empery/shared').InventoryEntry[] = [];
  const entries = reconcileInventoryEntries(save.inventory, save.inventoryEnchants, save.inventoryEntries);

  for (const entry of entries) {
    const item = getItem(entry.itemId);
    if (!item || item.unsellable) {
      keptEntries.push(entry);
      continue;
    }
    const qty = Math.max(1, Math.floor(entry.quantity || 1));
    total += estimateSellPrice(item) * qty;
    count += qty;
  }

  if (count === 0) {
    return { save, ok: false, message: 'Нечего продать.' };
  }

  const next = applyStatsToSave({
    ...setInventoryEntriesOnSave(save, keptEntries),
    adena: (save.adena ?? 0) + total,
  });

  return {
    save: next,
    ok: true,
    message: `Продано предметов: ${count} (+${total} adena).`,
  };
}

export function loadCraftRecipes(): CraftRecipe[] {
  if (craftRecipesCache && craftRecipesById) return craftRecipesCache;
  const dir = join(contentRoot, 'crafts');
  if (!existsSync(dir)) {
    craftRecipesCache = [];
    craftRecipesById = new Map();
    return craftRecipesCache;
  }
  const recipes: CraftRecipe[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const docs = parseAllDocuments(readFileSync(join(dir, name), 'utf8'));
    for (const doc of docs) {
      const raw = doc.toJSON() as CraftRecipe | null;
      if (raw?.id && raw.result && raw.ingredients) recipes.push(raw);
    }
  }
  craftRecipesCache = recipes;
  craftRecipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return craftRecipesCache;
}

export function getCraftRecipe(id: string): CraftRecipe | undefined {
  loadCraftRecipes();
  return craftRecipesById!.get(id);
}

/** Tests / content hot-reload — discard parsed town YAML. */
export function clearTownServicesCache(): void {
  resolvedShopIds.clear();
  shopYamlCache.clear();
  craftRecipesCache = null;
  craftRecipesById = null;
}

function countIngredient(inventory: string[], itemId: string): number {
  return inventory.filter((id) => id === itemId).length;
}

function removeIngredients(
  save: PlayerSave,
  ingredients: Record<string, number>,
): { ok: true; save: PlayerSave } | { ok: false; message: string } {
  const needIds: string[] = [];
  for (const [itemId, need] of Object.entries(ingredients)) {
    const have = countIngredient(save.inventory, itemId);
    if (have < need) {
      const label = getItem(itemId)?.name ?? itemId;
      return { ok: false, message: `Не хватает: ${label} (нужно ${need}, есть ${have}).` };
    }
    for (let i = 0; i < need; i++) needIds.push(itemId);
  }
  const next = removeItemIdsFromSave(save, needIds);
  if (!next) return { ok: false, message: 'Не хватает ингредиентов.' };
  return { ok: true, save: next };
}

export function craftItem(save: PlayerSave, recipeId: string): TownActionResult {
  const recipe = getCraftRecipe(recipeId);
  if (!recipe) {
    return { save, ok: false, message: 'Неизвестный рецепт.' };
  }

  const resultItem = getItem(recipe.result);
  if (!resultItem) {
    return { save, ok: false, message: 'Результат крафта не найден.' };
  }

  const removed = removeIngredients(save, recipe.ingredients);
  if (!removed.ok) {
    return { save, ok: false, message: removed.message };
  }

  const next = applyStatsToSave(appendItemsToSave(removed.save, [recipe.result]));

  const costParts = Object.entries(recipe.ingredients)
    .map(([id, n]) => `${n}× ${getItem(id)?.name ?? id}`)
    .join(', ');

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'CRAFT',
    playerId: save.id,
    locationId: save.location,
    payload: { recipeId, itemId: recipe.result, itemName: resultItem.name },
    timestamp: Date.now(),
  });

  return {
    save: next,
    ok: true,
    message: `Скрафчено: ${resultItem.name} (−${costParts}).`,
  };
}

export function craftChoiceLabel(save: PlayerSave, recipe: CraftRecipe): string {
  const parts = Object.entries(recipe.ingredients)
    .map(([id, n]) => {
      const have = countIngredient(save.inventory, id);
      return `${have}/${n} ${getItem(id)?.name ?? id}`;
    })
    .join(', ');
  return `${recipe.name} (${parts})`;
}

export function restAtInn(save: PlayerSave, now = Date.now()): TownActionResult {
  const maxHp = save.maxHp;
  const maxMp = save.maxMp ?? 0;
  const hpFull = save.hp >= maxHp;
  const mpFull = maxMp <= 0 || (save.mp ?? 0) >= maxMp;
  const state = survivalOf(save, now);
  const tired =
    state.fatigue >= 50 ||
    state.conditions.some((c) => c.id === 'fatigued' || c.id === 'exhaustion_injury');
  if (hpFull && mpFull && !tired) {
    return { save, ok: false, message: 'Ты и так в полном здравии.' };
  }

  const adena = save.adena ?? 0;
  if (adena < INN_REST_COST) {
    return { save, ok: false, message: `Отдых стоит ${INN_REST_COST} adena.` };
  }

  const healed = applyStatsToSave({
    ...save,
    adena: adena - INN_REST_COST,
    hp: maxHp,
    mp: maxMp > 0 ? maxMp : save.mp,
  });
  const rested = applyRestRecovery(healed, now, { instantFatigueRelief: 45, restMinutes: 30 });
  if (rested.ok) {
    void worldEvents.publish({
      type: 'PLAYER_ACTION',
      action: 'REST',
      playerId: save.id,
      locationId: save.location,
      payload: { action: 'REST_AT_INN', cost: INN_REST_COST },
      timestamp: now,
    });
  }

  if (!rested.ok) {
    const healLine =
      maxMp > 0
        ? `HP и MP восстановлены. (−${INN_REST_COST} adena)`
        : `HP восстановлено. (−${INN_REST_COST} adena)`;
    return { save: healed, ok: true, message: healLine };
  }

  const healPart =
    !hpFull || !mpFull
      ? maxMp > 0
        ? `HP и MP восстановлены. `
        : `HP восстановлено. `
      : '';
  return {
    save: applyStatsToSave(rested.save),
    ok: true,
    message: `${healPart}${rested.message} (−${INN_REST_COST} adena)`,
  };
}

export function merchantChoiceToItem(choiceId: string): string | null {
  if (!choiceId.startsWith('buy_')) return null;
  return choiceId.slice('buy_'.length);
}

export function craftRecipeFromChoice(choiceId: string): string | null {
  if (!choiceId.startsWith('craft_')) return null;
  return choiceId;
}
