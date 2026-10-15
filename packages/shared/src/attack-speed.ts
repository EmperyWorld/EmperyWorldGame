export type WeaponWeight = 'light' | 'normal' | 'heavy';

const BASE_DELAY_MS = 480;
const WEAPON_DELAY_MULT: Record<WeaponWeight, number> = {
  light: 0.72,
  normal: 1,
  heavy: 1.28,
};
/** Сколько мс снимает каждый пункт DEX с задержки атаки (лёгкое оружие — сильнее) */
const DEX_MS_PER_POINT: Record<WeaponWeight, number> = {
  light: 7,
  normal: 3.5,
  heavy: 1.5,
};

export interface AttackSpeedInput {
  dex: number;
  weaponWeight?: WeaponWeight;
  /** Бонус предметов: attackSpeed или часть speed с оружия */
  itemBonusMs?: number;
}

export function calcAttackDelayMs(input: AttackSpeedInput): number {
  const weight = input.weaponWeight ?? 'normal';
  const dexReduction = Math.floor(input.dex * DEX_MS_PER_POINT[weight]);
  const delay = BASE_DELAY_MS * WEAPON_DELAY_MULT[weight] - dexReduction - (input.itemBonusMs ?? 0);
  return Math.max(220, Math.min(900, Math.floor(delay)));
}

/** Рейтинг для HUD (выше = быстрее), в духе L2 */
export function calcAttackSpeedRating(delayMs: number): number {
  return Math.round((1000 / delayMs) * 160);
}

export function weaponWeightLabel(weight: WeaponWeight): string {
  switch (weight) {
    case 'light':
      return 'лёгкое';
    case 'heavy':
      return 'тяжёлое';
    default:
      return 'обычное';
  }
}
