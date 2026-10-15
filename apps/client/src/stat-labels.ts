/** Russian labels for combat stats in HUD / inventory / shop / skills. */

export const STAT_LABELS: Record<string, string> = {
  pAtk: 'Атк',
  pDef: 'Защ',
  mAtk: 'Маг',
  mDef: 'М.защ',
  maxHp: 'HP',
  maxMp: 'MP',
  accuracy: 'Точность',
  evasion: 'Уклонение',
  critRate: 'Крит',
  attackSpeed: 'Скор. атаки',
  attackDelayMs: 'Задержка атаки',
  blockChance: 'Блок',
  speed: 'Скорость',
  mpRegen: 'Реген MP/5с',
  hpRegen: 'Реген HP/5с',
  evasionWhileMoving: 'Укл. в движении',
  evasionWhileIdle: 'Укл. в стойке',
  attackRange: 'Дальность',
  healPowerPct: 'Сила хила %',
  mpRestorePct: 'Сила подпитки %',
  buffPowerPct: 'Сила бафов %',
};

export function statLabel(key: string): string {
  return STAT_LABELS[key] ?? key;
}

export function formatAdenaLabel(n: number): string {
  return `${Math.max(0, Math.floor(n)).toLocaleString('ru-RU')} адены`;
}
