import type { PlayerSave } from '@empery/shared';
import { cancelConflictingQuests } from './quests.js';

/** Активация квеста (`*_active`) — можно шарить пати. */
export function isQuestActiveFlag(flag: string): boolean {
  return flag.startsWith('quest_') && flag.endsWith('_active');
}

export function startedFlagForActive(activeFlag: string): string {
  return activeFlag.replace(/_active$/, '_started');
}

export function completeFlagForActive(activeFlag: string): string {
  return activeFlag.replace(/_active$/, '_complete');
}

/**
 * Выдать союзнику тот же активный квест (если ещё не брал / не закрыл).
 * Возвращает null, если шарить нечего.
 */
export function applySharedQuestActivation(
  ally: PlayerSave,
  activeFlag: string,
): PlayerSave | null {
  if (!isQuestActiveFlag(activeFlag)) return null;
  const completeFlag = completeFlagForActive(activeFlag);
  if (ally.questFlags[completeFlag]) return null;
  if (ally.questFlags[activeFlag]) return null;

  const startedFlag = startedFlagForActive(activeFlag);
  let next = cancelConflictingQuests(ally, [activeFlag, startedFlag]);
  next = {
    ...next,
    questFlags: {
      ...next.questFlags,
      [startedFlag]: true,
      [activeFlag]: true,
    },
  };
  return next;
}
