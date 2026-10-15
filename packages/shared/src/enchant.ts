/** Максимальный уровень заточки у кузнеца (как в L2 — до +10 и выше редко). */
export const MAX_ENCHANT = 10;

/** Безопасная заточка: +1…+3 без риска (аналог safe enchant в L2). */
export const SAFE_ENCHANT = 3;

const ENCHANTABLE_SLOTS = new Set([
  'weapon',
  'weapon2',
  'shield',
  'head',
  'body',
  'legs',
  'gloves',
  'cloak',
]);

export function isEnchantableSlot(slot: string): boolean {
  return ENCHANTABLE_SLOTS.has(slot);
}

/** Шанс успеха при переходе currentLevel → currentLevel+1. */
export function enchantSuccessRate(currentLevel: number): number {
  if (currentLevel < SAFE_ENCHANT) return 1;
  // L2: с +4 шанс падает (~70% на каждый следующий уровень).
  return 0.7 ** (currentLevel - SAFE_ENCHANT + 1);
}

export function formatEnchantChance(currentLevel: number): string {
  const rate = enchantSuccessRate(currentLevel);
  if (rate >= 1) return '100%';
  return `${Math.round(rate * 100)}%`;
}

/** Стоимость заточки за adena (currentLevel → currentLevel+1). */
export function enchantCost(currentLevel: number): number {
  return 100 * 2 ** currentLevel;
}

/** Бонус P.Atk от заточки оружия (L2: +1–3 по +2, с +4 по +6). */
export function weaponEnchantBonus(level: number): { pAtk: number } {
  if (level <= 0) return { pAtk: 0 };
  const safe = Math.min(level, SAFE_ENCHANT);
  const over = Math.max(0, level - SAFE_ENCHANT);
  return { pAtk: safe * 2 + over * 6 };
}

/** Бонус брони (L2: +1–3 по +1 P.Def, с +4 по +3 P.Def и +5 HP). */
export function armorEnchantBonus(level: number): { pDef: number; maxHp: number } {
  if (level <= 0) return { pDef: 0, maxHp: 0 };
  const safe = Math.min(level, SAFE_ENCHANT);
  const over = Math.max(0, level - SAFE_ENCHANT);
  return { pDef: safe * 1 + over * 3, maxHp: over * 5 };
}

export function enchantBonusForSlot(
  slot: string,
  level: number,
): { pAtk?: number; pDef?: number; maxHp?: number } {
  if (level <= 0 || !isEnchantableSlot(slot)) return {};
  if (slot === 'weapon' || slot === 'weapon2') return weaponEnchantBonus(level);
  return armorEnchantBonus(level);
}

export function normalizeInventoryEnchants(inventory: string[], raw?: number[]): number[] {
  const enchants = [...(raw ?? [])];
  while (enchants.length < inventory.length) enchants.push(0);
  return enchants.slice(0, inventory.length);
}

export function getEquipmentEnchant(
  enchants: Record<string, number> | undefined,
  slot: string,
): number {
  return enchants?.[slot] ?? 0;
}

export function maxInventoryEnchantForItem(
  inventory: string[],
  inventoryEnchants: number[] | undefined,
  itemId: string,
): number {
  const enchants = normalizeInventoryEnchants(inventory, inventoryEnchants);
  let max = 0;
  inventory.forEach((id, index) => {
    if (id === itemId) max = Math.max(max, enchants[index] ?? 0);
  });
  return max;
}
