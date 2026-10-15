import type { PlayerSave, PlayerStats } from '@empery/shared';

/** Client HUD historically ticked this interval and PATCHed hp/mp — now server-only. */
export const VITALS_REGEN_MS = 5_000;

type VitalsRates = Pick<PlayerStats, 'maxHp' | 'maxMp'> & {
  hpRegen?: number;
  mpRegen?: number;
};

export function applyVitalsRegen(save: PlayerSave, stats: VitalsRates): PlayerSave {
  if (save.hp <= 0) return save;

  const maxHp = stats.maxHp || save.maxHp;
  const maxMp = stats.maxMp ?? save.maxMp ?? 0;
  const hpRate = stats.hpRegen ?? 0;
  const mpRate = stats.mpRegen ?? 0;
  let hp = save.hp;
  let mp = save.mp ?? maxMp;

  if (hpRate > 0 && maxHp > 0 && hp < maxHp) {
    hp = Math.min(maxHp, hp + hpRate);
  }
  if (mpRate > 0 && maxMp > 0 && mp < maxMp) {
    mp = Math.min(maxMp, mp + mpRate);
  }
  if (hp === save.hp && mp === (save.mp ?? maxMp)) return save;
  return { ...save, hp, mp, maxHp, maxMp };
}
