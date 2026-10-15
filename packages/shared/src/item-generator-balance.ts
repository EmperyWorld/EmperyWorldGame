/**
 * Баланс и clamp для генератора предметов.
 * Статы НЕ берутся из LLM — только из этих бюджетов.
 */

export type ItemRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'holy'
  | 'daedric';

export type ItemSlot =
  | 'weapon'
  | 'shield'
  | 'quiver'
  | 'head'
  | 'body'
  | 'legs'
  | 'gloves'
  | 'cloak';

/** Абсолютный потолок — даже баг/LLM не пробьёт. */
export const STAT_HARD_CAPS: Record<string, number> = {
  pAtk: 80,
  pDef: 70,
  maxHp: 120,
  maxMp: 100,
  accuracy: 20,
  evasion: 22,
  critRate: 15,
  speed: 18,
  attackSpeed: 14,
  blockChance: 28,
};

/** Минимальные (отрицательные) значения — штрафы брони. */
export const STAT_HARD_FLOORS: Record<string, number> = {
  pAtk: 0,
  pDef: 0,
  maxHp: 0,
  maxMp: 0,
  accuracy: 0,
  evasion: -15,
  critRate: 0,
  speed: -12,
  attackSpeed: -8,
  blockChance: 0,
};

export interface StatBudget {
  /** Основной боевой стат слота */
  primary: [number, number];
  secondary?: Record<string, [number, number]>;
}

/** Бюджеты по редкости × роли слота. */
const WEAPON_PATK: Record<ItemRarity, [number, number]> = {
  common: [5, 12],
  uncommon: [10, 18],
  rare: [18, 30],
  epic: [32, 46],
  legendary: [46, 58],
  holy: [58, 70],
  daedric: [60, 72],
};

const BODY_PDEF: Record<ItemRarity, [number, number]> = {
  common: [4, 10],
  uncommon: [8, 16],
  rare: [16, 30],
  epic: [28, 42],
  legendary: [40, 54],
  holy: [44, 58],
  daedric: [48, 65],
};

const HEAD_PDEF: Record<ItemRarity, [number, number]> = {
  common: [2, 6],
  uncommon: [5, 10],
  rare: [8, 16],
  epic: [14, 24],
  legendary: [18, 28],
  holy: [20, 32],
  daedric: [24, 36],
};

const SMALL_PDEF: Record<ItemRarity, [number, number]> = {
  common: [2, 5],
  uncommon: [4, 9],
  rare: [7, 14],
  epic: [12, 20],
  legendary: [16, 24],
  holy: [18, 28],
  daedric: [20, 30],
};

const SHIELD_PDEF: Record<ItemRarity, [number, number]> = {
  common: [6, 12],
  uncommon: [10, 18],
  rare: [14, 24],
  epic: [22, 32],
  legendary: [30, 40],
  holy: [36, 48],
  daedric: [38, 52],
};

const BLOCK: Record<ItemRarity, [number, number]> = {
  common: [4, 8],
  uncommon: [6, 11],
  rare: [8, 14],
  epic: [12, 18],
  legendary: [16, 22],
  holy: [18, 26],
  daedric: [16, 24],
};

export const BOW_RANGE: Record<ItemRarity, [number, number]> = {
  common: [140, 180],
  uncommon: [170, 220],
  rare: [220, 280],
  epic: [280, 340],
  legendary: [320, 400],
  holy: [380, 460],
  daedric: [420, 500],
};

export function clampStat(key: string, value: number): number {
  const floor = STAT_HARD_FLOORS[key] ?? -50;
  const cap = STAT_HARD_CAPS[key] ?? 50;
  if (!Number.isFinite(value)) return 0;
  return Math.max(floor, Math.min(cap, Math.round(value)));
}

export function clampStats(stats: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    // attackRange живёт на корне предмета, не в stats-капе так же строго
    if (k === 'attackRange') {
      out[k] = Math.max(80, Math.min(520, Math.round(v)));
      continue;
    }
    const c = clampStat(k, v);
    if (c !== 0) out[k] = c;
  }
  return out;
}

function rollInt(min: number, max: number, rng: () => number): number {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(a + rng() * (b - a + 1));
}

function maybe(rng: () => number, p: number): boolean {
  return rng() < p;
}

export function rollWeaponStats(
  rarity: ItemRarity,
  kind: 'melee' | 'bow' | 'staff',
  weight: 'light' | 'normal' | 'heavy',
  rng: () => number,
): Record<string, number> {
  const [lo, hi] = WEAPON_PATK[rarity];
  let pAtk = rollInt(lo, hi, rng);
  if (weight === 'heavy') pAtk = Math.round(pAtk * 1.08);
  if (weight === 'light') pAtk = Math.round(pAtk * 0.94);
  if (kind === 'staff') pAtk = Math.round(pAtk * 0.9);

  const stats: Record<string, number> = { pAtk };
  stats.accuracy = rollInt(1, Math.min(16, 2 + Math.floor(hi / 8)), rng);

  if (kind === 'staff') {
    stats.maxMp = rollInt(6, Math.min(40, 8 + Math.floor(hi / 4)), rng);
    if (maybe(rng, 0.55)) stats.accuracy += rollInt(1, 3, rng);
  } else if (weight === 'light' || kind === 'bow') {
    if (maybe(rng, 0.85)) stats.critRate = rollInt(1, Math.min(12, 2 + Math.floor(hi / 10)), rng);
    if (maybe(rng, 0.7)) stats.attackSpeed = rollInt(2, Math.min(12, 3 + Math.floor(hi / 12)), rng);
  } else if (weight === 'heavy') {
    if (maybe(rng, 0.4)) stats.attackSpeed = -rollInt(1, 4, rng);
    if (maybe(rng, 0.5)) stats.critRate = rollInt(1, 5, rng);
  } else if (maybe(rng, 0.55)) {
    stats.critRate = rollInt(1, 6, rng);
  }

  if (kind === 'bow' && maybe(rng, 0.35)) {
    stats.accuracy += rollInt(1, 3, rng);
  }

  return clampStats(stats);
}

export function rollArmorStats(
  slot: Exclude<ItemSlot, 'weapon' | 'shield' | 'quiver'>,
  rarity: ItemRarity,
  armorType: 'light' | 'heavy' | 'robe',
  rng: () => number,
): Record<string, number> {
  const table = slot === 'body' ? BODY_PDEF : slot === 'head' ? HEAD_PDEF : SMALL_PDEF;
  const [lo, hi] = table[rarity];
  let pDef = rollInt(lo, hi, rng);
  if (armorType === 'heavy') pDef = Math.round(pDef * 1.1);
  if (armorType === 'light') pDef = Math.round(pDef * 0.92);
  if (armorType === 'robe') pDef = Math.max(1, Math.round(pDef * 0.28));

  const stats: Record<string, number> = { pDef };

  if (slot === 'body' || slot === 'head') {
    if (armorType === 'robe') {
      stats.maxMp = rollInt(Math.floor(hi * 0.8), Math.floor(hi * 2.2), rng);
      stats.evasion = -rollInt(2, Math.min(10, 3 + Math.floor(hi / 8)), rng);
    } else {
      stats.maxHp = rollInt(Math.floor(hi * 0.4), Math.floor(hi * 1.2), rng);
    }
  }
  if (armorType === 'robe') {
    if (maybe(rng, 0.7)) stats.maxMp = (stats.maxMp ?? 0) + rollInt(4, 18, rng);
    if (maybe(rng, 0.45)) stats.accuracy = rollInt(1, 6, rng);
  } else if (armorType === 'light') {
    if (maybe(rng, 0.75)) stats.evasion = rollInt(2, Math.min(16, 3 + Math.floor(hi / 6)), rng);
    if (maybe(rng, 0.45)) stats.speed = rollInt(2, 12, rng);
    if (maybe(rng, 0.35)) stats.critRate = rollInt(1, 5, rng);
  } else {
    if (maybe(rng, 0.4)) stats.evasion = -rollInt(1, 8, rng);
    if (maybe(rng, 0.45)) stats.speed = -rollInt(1, 8, rng);
    if (maybe(rng, 0.5)) stats.pAtk = rollInt(1, Math.min(10, 2 + Math.floor(hi / 10)), rng);
  }

  if (slot === 'cloak' && maybe(rng, 0.55)) {
    stats.maxMp = rollInt(8, Math.min(90, 12 + hi), rng);
  }
  if (slot === 'gloves' && maybe(rng, 0.6)) {
    stats.accuracy = rollInt(2, 10, rng);
  }
  if (slot === 'legs' && maybe(rng, 0.55)) {
    stats.speed = (stats.speed ?? 0) + rollInt(2, 10, rng);
  }

  return clampStats(stats);
}

export function rollShieldStats(rarity: ItemRarity, rng: () => number): Record<string, number> {
  const [plo, phi] = SHIELD_PDEF[rarity];
  const [blo, bhi] = BLOCK[rarity];
  return clampStats({
    pDef: rollInt(plo, phi, rng),
    blockChance: rollInt(blo, bhi, rng),
    maxHp: rollInt(Math.floor(plo * 0.5), Math.floor(phi * 0.9), rng),
  });
}

export function rollQuiverStats(rarity: ItemRarity, rng: () => number): Record<string, number> {
  const tier = WEAPON_PATK[rarity];
  return clampStats({
    pAtk: rollInt(2, Math.min(16, 3 + Math.floor(tier[1] / 8)), rng),
    accuracy: rollInt(2, 12, rng),
    critRate: rollInt(1, 8, rng),
  });
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function slugifyId(raw: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const lower = raw.toLowerCase().trim();
  let out = '';
  for (const ch of lower) {
    if (map[ch] !== undefined) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|_|-/.test(ch)) out += '_';
  }
  out = out.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!out) out = 'relic';
  if (!/^[a-z]/.test(out)) out = `item_${out}`;
  return out.slice(0, 48);
}

export function assertSaneStats(stats: Record<string, number>): void {
  for (const [k, v] of Object.entries(stats)) {
    if (!Number.isFinite(v)) throw new Error(`non-finite stat ${k}`);
    const cap = STAT_HARD_CAPS[k];
    if (cap !== undefined && Math.abs(v) > cap + 1) {
      throw new Error(`stat ${k}=${v} exceeds hard cap ${cap}`);
    }
    if (Math.abs(v) > 200) throw new Error(`insane stat ${k}=${v}`);
  }
}
