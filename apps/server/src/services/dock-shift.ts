/**
 * Портовая смена грузчика Петра (town_dockhand): взять ящики, пройтись с весом, сдать за плату.
 * Повторяемая (только quest_dock_shift_active, без complete-замка).
 */
import type { PlayerSave } from '@empery/shared';
import { PLAYER_STAMINA_MAX, clampPlayerStamina } from '@empery/shared';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';

export const DOCKHAND_NPC_ID = 'town_dockhand';
export const DOCK_SHIFT_ACTIVE_FLAG = 'quest_dock_shift_active';
export const DOCK_SHIFT_COUNT_FLAG = 'haven_dock_shifts';
export const DOCK_SHIFT_CRATE_ID = 'port_crate';
export const DOCK_SHIFT_CRATE_COUNT = 2;
export const DOCK_SHIFT_REWARD_ADENA = 70;
export const DOCK_SHIFT_STAMINA_COST = 80;

export interface DockShiftResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

export function countPortCrates(save: PlayerSave): number {
  return (save.inventory ?? []).filter((id) => id === DOCK_SHIFT_CRATE_ID).length;
}

function crateIds(count: number): string[] {
  return Array.from({ length: count }, () => DOCK_SHIFT_CRATE_ID);
}

function removeAllPortCrates(save: PlayerSave): PlayerSave {
  const n = countPortCrates(save);
  if (n <= 0) return save;
  return removeItemIdsFromSave(save, crateIds(n)) ?? save;
}

function drainShiftStamina(save: PlayerSave): PlayerSave {
  const current = typeof save.stamina === 'number' ? save.stamina : PLAYER_STAMINA_MAX;
  return {
    ...save,
    stamina: clampPlayerStamina(current - DOCK_SHIFT_STAMINA_COST),
    staminaAt: new Date().toISOString(),
  };
}

function clearActiveFlag(flags: PlayerSave['questFlags']): PlayerSave['questFlags'] {
  const next = { ...flags };
  delete next[DOCK_SHIFT_ACTIVE_FLAG];
  return next;
}

/** Выдать 2 ящика, отметить смену, снять выносливость. Повторный вызов при активной смене — напоминание. */
export function startDockShift(save: PlayerSave): DockShiftResult {
  if (hasFlag(save, DOCK_SHIFT_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: 'Ящики ещё у тебя. Не бросай груз — пройдись и вернись ко мне.',
    };
  }

  // appendItemsToSave всегда дописывает в сумку (лимита слотов нет).
  const withCrates = appendItemsToSave(save, crateIds(DOCK_SHIFT_CRATE_COUNT));
  const drained = drainShiftStamina(withCrates);
  const next: PlayerSave = {
    ...drained,
    questFlags: {
      ...drained.questFlags,
      [DOCK_SHIFT_ACTIVE_FLAG]: true,
    },
  };

  return {
    save: next,
    ok: true,
    message:
      'Держи два ящика. Не бросай их по дороге — вес сам напомнит. Пройдись и вернись к Петру на пристань.',
  };
}

/** Сдать ≥2 ящика, получить 70 адены, снять active, увеличить haven_dock_shifts. */
export function finishDockShift(save: PlayerSave): DockShiftResult {
  if (!hasFlag(save, DOCK_SHIFT_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала возьми ящики — без смены сдавать нечего.',
    };
  }

  const crates = countPortCrates(save);
  if (crates < DOCK_SHIFT_CRATE_COUNT) {
    return {
      save,
      ok: false,
      message: 'Ящики потеряны? Без груза смены нет.',
    };
  }

  // Сдать все port_crate, не оставлять unsellable хвост сверх нормы смены.
  const removed = removeItemIdsFromSave(save, crateIds(crates));
  if (!removed) {
    return {
      save,
      ok: false,
      message: 'Ящики потеряны? Без груза смены нет.',
    };
  }

  const shifts = (Number(removed.questFlags[DOCK_SHIFT_COUNT_FLAG]) || 0) + 1;
  const next = applyStatsToSave({
    ...removed,
    adena: (removed.adena ?? 0) + DOCK_SHIFT_REWARD_ADENA,
    questFlags: {
      ...clearActiveFlag(removed.questFlags),
      [DOCK_SHIFT_COUNT_FLAG]: shifts,
    },
  });

  return {
    save: next,
    ok: true,
    message: `Крепкие руки. Держи ${DOCK_SHIFT_REWARD_ADENA} адены за смену.`,
  };
}

/** Снять все port_crate, сбросить active, без оплаты. */
export function abandonDockShift(save: PlayerSave): DockShiftResult {
  if (!hasFlag(save, DOCK_SHIFT_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Смены нет — и ящиков сдавать нечего.',
    };
  }

  const stripped = removeAllPortCrates(save);
  const next: PlayerSave = {
    ...stripped,
    questFlags: clearActiveFlag(stripped.questFlags),
  };

  return {
    save: next,
    ok: true,
    message: 'Ладно, ящики назад. Смены нет — и платы нет.',
  };
}
