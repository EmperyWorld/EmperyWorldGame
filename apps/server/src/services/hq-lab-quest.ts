/**
 * EmperyWorld HQ lab quest & data terminal services (Д-р Вейн & Терминал).
 * Accept → bring stabilization component (filter or battery) → reward & campus perks.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const HQ_LAB_ACTIVE_FLAG = 'quest_hq_lab_active';
export const HQ_LAB_COMPLETE_FLAG = 'quest_hq_lab_complete';
export const HQ_LAB_REWARD_ADENA = 160;
export const HQ_LAB_REWARD_ITEM = 'radio_battery_24h';

/** Components suitable for laboratory stabilization matrix. */
const STABILIZER_COMPONENT_IDS = [
  'radio_battery_12h',
  'radio_battery_pack',
  'charcoal_filter',
  'void_petal',
] as const;

export interface HqLabActionResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

export function findHqLabComponent(save: PlayerSave): string | null {
  const bag = save.inventory ?? [];
  for (const id of STABILIZER_COMPONENT_IDS) {
    if (bag.includes(id)) return id;
  }
  return null;
}

export function acceptHqLabQuest(save: PlayerSave): HqLabActionResult {
  if (hasFlag(save, HQ_LAB_COMPLETE_FLAG)) {
    return { save, ok: false, message: 'Стабилизационная матрица уже откалибрована. Благодарю за содействие.' };
  }
  if (hasFlag(save, HQ_LAB_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: 'Запрос активен: доставь угольный фильтр, батарейный блок или лепесток пустоты.',
    };
  }
  const next: PlayerSave = {
    ...save,
    questFlags: { ...save.questFlags, [HQ_LAB_ACTIVE_FLAG]: true },
  };
  return {
    save: next,
    ok: true,
    message:
      'Отлично. Для калибровки резонансного контура подойдёт угольный фильтр, блок питания рации или лепесток разлома. Жду образец.',
  };
}

export function submitHqLabComponent(save: PlayerSave): HqLabActionResult {
  if (hasFlag(save, HQ_LAB_COMPLETE_FLAG)) {
    return { save, ok: false, message: 'Текущий протокол завершён. Матрица работает в штатном режиме.' };
  }
  if (!hasFlag(save, HQ_LAB_ACTIVE_FLAG)) {
    return { save, ok: false, message: 'Сначала подтверди участие в исследовательском протоколе.' };
  }

  const compId = findHqLabComponent(save);
  if (!compId) {
    return {
      save,
      ok: false,
      message: 'В сумке нет подходящего компонента (нужен угольный фильтр, батарейный блок или лепесток).',
    };
  }

  const removed = removeItemIdsFromSave(save, [compId]);
  if (!removed) {
    return { save, ok: false, message: 'Не удалось извлечь образец из инвентаря.' };
  }

  const withGold: PlayerSave = {
    ...removed,
    adena: (removed.adena ?? 0) + HQ_LAB_REWARD_ADENA,
    questFlags: {
      ...removed.questFlags,
      [HQ_LAB_COMPLETE_FLAG]: true,
    },
  };
  delete withGold.questFlags[HQ_LAB_ACTIVE_FLAG];

  const withItem = appendItemsToSave(withGold, [HQ_LAB_REWARD_ITEM]);
  const finalSave = applyStatsToSave(withItem);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'HQ_LAB_COMPONENT_SUBMITTED', componentId: compId, rewardAdena: HQ_LAB_REWARD_ADENA },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message: `Образец принят! Получено ${HQ_LAB_REWARD_ADENA} адены и сверхёмкий энергоблок (${HQ_LAB_REWARD_ITEM}). Доступ к служебным функциям терминала разблокирован.`,
  };
}

export function rebootHqBiofield(save: PlayerSave): HqLabActionResult {
  if (!hasFlag(save, HQ_LAB_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Доступ ограничен. Сначала выполните калибровку протокола у д-ра Вейна в лаборатории.',
    };
  }

  const curMp = save.mp ?? 0;
  const maxMp = save.maxMp ?? 0;
  const fullyRestored = save.hp >= save.maxHp && curMp >= maxMp;
  if (fullyRestored) {
    return {
      save,
      ok: false,
      message: 'Биопоказатели в норме. Экстренная подпитка не требуется.',
    };
  }

  const next: PlayerSave = {
    ...save,
    hp: save.maxHp,
    mp: save.maxMp ?? save.mp,
  };

  return {
    save: next,
    ok: true,
    message: 'Служебный импульс ядра перезагрузил ваши биоконтуры: HP и MP восстановлены до максимума!',
  };
}
