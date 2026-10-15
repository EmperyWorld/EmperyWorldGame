/**
 * Haven stable care — Конюх Борис (town_stable):
 * чистка копыт, кормление сеном, продажа охапки через диалог (не shop UI).
 */
import type { PlayerSave } from '@empery/shared';
import { MOUNT_STAMINA_MAX, clampMountStamina } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { normalizeMountState } from './mounts.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const STABLE_GROOM_COST = 15;
export const STABLE_FEED_COST = 8;
export const STABLE_HAY_COST = 6;
export const STABLE_FEED_STAMINA = 400;
export const STABLE_HAY_ITEM = 'stable_hay';
export const STABLE_GROOM_BUFF_ID = 'stable_groom';
export const STABLE_GROOM_BUFF_AMOUNT = 18;
export const STABLE_GROOM_BUFF_DURATION_MS = 20 * 60 * 1000;
export const STABLE_GROOM_BUFF_NAME = 'Свежие копыта';
export const STABLE_NO_MOUNT_MESSAGE = 'Нет лошади. Купи скакуна у Бориса.';
/** Выносливость ≥ этого порога считается «отдохнул» в репликах Бориса. */
export const STABLE_STAMINA_RESTED = 500;

export interface StableCareResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasHay(save: PlayerSave): boolean {
  return (save.inventory ?? []).includes(STABLE_HAY_ITEM);
}

function writeMount(save: PlayerSave, patch: Partial<ReturnType<typeof normalizeMountState>>): PlayerSave {
  const current = normalizeMountState(save.mount);
  return {
    ...save,
    mount: normalizeMountState({ ...current, ...patch }),
  };
}

function poorMessage(cost: number, currentAdena: number, noun: string): string {
  return `${noun} стоит ${cost} адены. У тебя: ${currentAdena}.`;
}

function publishCare(save: PlayerSave, action: string, extra: Record<string, unknown> = {}): void {
  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: save.id,
    locationId: save.location,
    payload: { action, ...extra },
    timestamp: Date.now(),
  });
}

/** Чистка копыт: stamina на максимум, бафф скорости, 15 адены. */
export function stableGroomMount(save: PlayerSave): StableCareResult {
  const mount = normalizeMountState(save.mount);
  if (!mount.ownedId) {
    return { save, ok: false, message: STABLE_NO_MOUNT_MESSAGE };
  }

  const currentAdena = save.adena ?? 0;
  if (currentAdena < STABLE_GROOM_COST) {
    return {
      save,
      ok: false,
      message: poorMessage(STABLE_GROOM_COST, currentAdena, 'Чистка копыт'),
    };
  }

  const nowIso = new Date().toISOString();
  let next = writeMount(
    { ...save, adena: currentAdena - STABLE_GROOM_COST },
    { stamina: MOUNT_STAMINA_MAX, staminaAt: nowIso },
  );
  next = applyNamedBuff(next, {
    buffId: STABLE_GROOM_BUFF_ID,
    buffStat: 'speed',
    buffName: STABLE_GROOM_BUFF_NAME,
    amount: STABLE_GROOM_BUFF_AMOUNT,
    durationMs: STABLE_GROOM_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(next);
  publishCare(finalSave, 'STABLE_GROOM', { cost: STABLE_GROOM_COST });

  return {
    save: finalSave,
    ok: true,
    message: `Борис вычистил копыта до блеска. Выносливость скакуна полная (${MOUNT_STAMINA_MAX}). Получен бафф «${STABLE_GROOM_BUFF_NAME}» (+${STABLE_GROOM_BUFF_AMOUNT} скорости на 20 мин). Списано ${STABLE_GROOM_COST} адены.`,
  };
}

/** Кормление: съесть stable_hay или взять 8 адены, +400 stamina (clamp). */
export function stableFeedMount(save: PlayerSave): StableCareResult {
  const mount = normalizeMountState(save.mount);
  if (!mount.ownedId) {
    return { save, ok: false, message: STABLE_NO_MOUNT_MESSAGE };
  }

  let paidWithHay = false;
  let next: PlayerSave = save;
  if (hasHay(save)) {
    const removed = removeItemIdsFromSave(save, [STABLE_HAY_ITEM]);
    if (!removed) {
      return { save, ok: false, message: 'Не удалось достать сено из сумки.' };
    }
    next = removed;
    paidWithHay = true;
  } else {
    const currentAdena = save.adena ?? 0;
    if (currentAdena < STABLE_FEED_COST) {
      return {
        save,
        ok: false,
        message: poorMessage(STABLE_FEED_COST, currentAdena, 'Горсть сена'),
      };
    }
    next = { ...save, adena: currentAdena - STABLE_FEED_COST };
  }

  const stamina = clampMountStamina(mount.stamina + STABLE_FEED_STAMINA);
  const nowIso = new Date().toISOString();
  next = writeMount(next, { stamina, staminaAt: nowIso });
  const finalSave = applyStatsToSave(next);
  publishCare(finalSave, 'STABLE_FEED', { paidWithHay, stamina });

  const payNote = paidWithHay
    ? 'Скакун съел охапку сена из сумки.'
    : `Борис бросил сено из своих запасов (${STABLE_FEED_COST} адены).`;
  return {
    save: finalSave,
    ok: true,
    message: `${payNote} Выносливость +${STABLE_FEED_STAMINA} (теперь ${stamina}/${MOUNT_STAMINA_MAX}).`,
  };
}

/** Купить 1 stable_hay за 6 адены (диалог, не витрина). */
export function stableBuyHay(save: PlayerSave): StableCareResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < STABLE_HAY_COST) {
    return {
      save,
      ok: false,
      message: poorMessage(STABLE_HAY_COST, currentAdena, 'Охапка сена'),
    };
  }

  let next = appendItemsToSave({ ...save, adena: currentAdena - STABLE_HAY_COST }, [STABLE_HAY_ITEM]);
  next = writeMount(next, {});
  const finalSave = applyStatsToSave(next);
  publishCare(finalSave, 'STABLE_BUY_HAY', { cost: STABLE_HAY_COST });

  return {
    save: finalSave,
    ok: true,
    message: `Держи охапку сена — в дороге пригодится. Списано ${STABLE_HAY_COST} адены.`,
  };
}
