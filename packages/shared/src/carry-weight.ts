/** Carry weight: body + equipment + inventory (kg). */

export type RaceBodyWeightId = 'human' | 'elf' | 'orc';

const RACE_BODY_KG: Record<RaceBodyWeightId, number> = {
  human: 72,
  elf: 58,
  orc: 95,
};

export interface WeightItemLike {
  id: string;
  slot: string;
  weight?: number;
  weaponWeight?: 'light' | 'normal' | 'heavy';
  armorType?: 'light' | 'heavy' | 'robe';
}

export function raceBodyWeightKg(race: string | undefined): number {
  if (race === 'elf' || race === 'orc') return RACE_BODY_KG[race];
  return RACE_BODY_KG.human;
}

/** Fallback mass when YAML has no `weight`. */
export function defaultItemWeightKg(item: WeightItemLike): number {
  if (typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight >= 0) {
    return item.weight;
  }
  const slot = item.slot;
  if (slot === 'weapon' || slot === 'weapon2') {
    if (item.weaponWeight === 'heavy') return 9;
    if (item.weaponWeight === 'light') return 2.2;
    return 4.5;
  }
  if (slot === 'shield') return 6;
  if (slot === 'body') {
    if (item.armorType === 'heavy') return 16;
    if (item.armorType === 'robe') return 3.5;
    return 7;
  }
  if (slot === 'legs') {
    if (item.armorType === 'heavy') return 10;
    if (item.armorType === 'robe') return 2.5;
    return 5;
  }
  if (slot === 'head') return item.armorType === 'heavy' ? 4 : 1.8;
  if (slot === 'gloves' || slot === 'boots') return item.armorType === 'heavy' ? 3.5 : 1.5;
  if (slot === 'cloak') return 1.2;
  if (slot === 'quiver') return 2.5;
  if (slot === 'ring' || slot === 'earring' || slot === 'necklace') return 0.15;
  if (slot === 'material' || slot === 'consumable') return 0.4;
  return 1;
}

export function itemWeightKg(item: WeightItemLike | undefined): number {
  if (!item) return 0;
  return defaultItemWeightKg(item);
}

export function computeCarryWeightKg(input: {
  race: string | undefined;
  equipment: Record<string, string | null | undefined>;
  inventory: string[];
  getItem: (id: string) => WeightItemLike | undefined;
}): {
  bodyKg: number;
  gearKg: number;
  bagKg: number;
  totalKg: number;
} {
  const bodyKg = raceBodyWeightKg(input.race);
  let gearKg = 0;
  for (const id of Object.values(input.equipment)) {
    if (!id) continue;
    gearKg += itemWeightKg(input.getItem(id));
  }
  let bagKg = 0;
  for (const id of input.inventory) {
    if (!id) continue;
    bagKg += itemWeightKg(input.getItem(id));
  }
  const totalKg = Math.round((bodyKg + gearKg + bagKg) * 10) / 10;
  return {
    bodyKg,
    gearKg: Math.round(gearKg * 10) / 10,
    bagKg: Math.round(bagKg * 10) / 10,
    totalKg,
  };
}
