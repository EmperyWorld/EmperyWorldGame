/**
 * Haven captain drill (Капитан Гаррет / town_captain):
 * paid stamina restore + short pAtk stance buff. Depths quest stays in YAML/dialogue.ts.
 */
import type { PlayerSave } from '@empery/shared';
import { PLAYER_STAMINA_MAX, clampPlayerStamina } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';

export const CAPTAIN_DRILL_COST = 12;
export const CAPTAIN_DRILL_STAMINA_RESTORE = 250;

export const CAPTAIN_DRILL_BUFF_ID = 'captain_drill';
export const CAPTAIN_DRILL_BUFF_STAT = 'pAtk' as const;
export const CAPTAIN_DRILL_BUFF_AMOUNT = 12;
export const CAPTAIN_DRILL_BUFF_DURATION_MS = 20 * 60 * 1000;
export const CAPTAIN_DRILL_BUFF_NAME = 'Строевая выправка';

export interface CaptainDrillResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function currentStamina(save: PlayerSave): number {
  return typeof save.stamina === 'number' ? save.stamina : PLAYER_STAMINA_MAX;
}

/** Строевая подготовка: 12 адены, +250 выносливости (clamp до MAX), бафф «Строевая выправка». */
export function captainDrill(save: PlayerSave): CaptainDrillResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < CAPTAIN_DRILL_COST) {
    return {
      save,
      ok: false,
      message: `Строевая стоит ${CAPTAIN_DRILL_COST} адены. Без звона в кармане в строй не встану.`,
    };
  }

  const restored = clampPlayerStamina(currentStamina(save) + CAPTAIN_DRILL_STAMINA_RESTORE);
  let next: PlayerSave = {
    ...save,
    adena: currentAdena - CAPTAIN_DRILL_COST,
    stamina: restored,
    staminaAt: new Date().toISOString(),
  };

  next = applyNamedBuff(next, {
    buffId: CAPTAIN_DRILL_BUFF_ID,
    buffStat: CAPTAIN_DRILL_BUFF_STAT,
    buffName: CAPTAIN_DRILL_BUFF_NAME,
    amount: CAPTAIN_DRILL_BUFF_AMOUNT,
    durationMs: CAPTAIN_DRILL_BUFF_DURATION_MS,
  });
  next = applyStatsToSave(next);

  return {
    save: next,
    ok: true,
    message:
      'Гаррет гоняет по плацу: шаг, стойка, удар. Выносливость вернулась, получена «Строевая выправка» (+12 к физ. атаке на 20 мин).',
  };
}
