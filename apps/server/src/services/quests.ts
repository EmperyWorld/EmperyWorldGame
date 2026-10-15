import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { PlayerSave } from '@empery/shared';
import { canEquipShield, canEquipBow, canEquipStaff, canEquipQuiver, canEquipArmorType } from '@empery/shared';
import { contentRoot } from './paths.js';
import { getItem } from './items.js';
import { applyStatsToSave } from './stats.js';
import {
  appendEntryToSave,
  appendItemsToSave,
  peekInventoryIndex,
  removeInventoryIndexFromSave,
} from './inventory-bag.js';

interface QuestConfig {
  id: string;
  /** NPC для входящего вызова по рации после завершения. */
  radioNpcId?: string;
  completeFlag: string;
  activeFlag: string;
  requiredKills: number;
  killCounterFlag: string;
  rewardItems: string[];
  enemyType?: string;
}

function loadQuest(id: string): QuestConfig {
  const path = join(contentRoot, 'quests', `${id}.yaml`);
  return parseYaml(readFileSync(path, 'utf8')) as QuestConfig;
}

export function getQuest(id: string): QuestConfig | undefined {
  try {
    return loadQuest(id);
  } catch {
    return undefined;
  }
}

export function radioNpcForQuest(questId: string): string | undefined {
  const npcId = getQuest(questId)?.radioNpcId;
  return npcId && npcId.length > 0 ? npcId : undefined;
}

export class QuestService {
  onEnemyDefeated(save: PlayerSave, questId: string, enemyType: string): PlayerSave {
    const quest = loadQuest(questId);
    const expectedEnemy = quest.enemyType ?? 'goblin_scout';
    if (enemyType !== expectedEnemy) return save;
    if (!save.questFlags[quest.activeFlag]) return save;

    const kills = Number(save.questFlags[quest.killCounterFlag] ?? 0) + 1;
    let next: PlayerSave = {
      ...save,
      questFlags: {
        ...save.questFlags,
        [quest.killCounterFlag]: kills,
      },
    };

    if (kills >= quest.requiredKills) {
      next = this.completeQuest(next, quest);
    }

    return next;
  }

  private completeQuest(save: PlayerSave, quest: QuestConfig): PlayerSave {
    if (save.questFlags[quest.completeFlag]) return save;

    const withRewards = appendItemsToSave(save, quest.rewardItems);

    return applyStatsToSave({
      ...withRewards,
      questFlags: {
        ...withRewards.questFlags,
        [quest.completeFlag]: true,
        [quest.activeFlag]: false,
      },
    });
  }
}
export function equipItem(
  save: PlayerSave,
  itemId: string,
  targetSlot?: string,
): PlayerSave {
  const item = getItem(itemId);
  if (!item || !save.inventory.includes(itemId)) return save;
  if (item.slot === 'material') return save;

  let slot = targetSlot ?? item.slot;

  if (item.slot === 'shield') {
    if (!canEquipShield(save.profession)) return save;
    slot = 'shield';
  }

  if (item.slot === 'quiver') {
    if (!canEquipQuiver(save.profession)) return save;
    slot = 'quiver';
  }

  // Второй клинок: только лёгкое оружие при изученном Безумном дуальщике
  if (slot === 'weapon2') {
    if (item.slot !== 'weapon' || item.weaponWeight !== 'light') return save;
    if (item.weaponKind === 'bow' || item.weaponKind === 'staff') return save;
    if ((save.skillLevels.mad_dualist ?? 0) <= 0) return save;
    const main = save.equipment.weapon ? getItem(save.equipment.weapon) : null;
    if (
      !main ||
      main.weaponWeight !== 'light' ||
      main.weaponKind === 'bow' ||
      main.weaponKind === 'staff'
    ) {
      return save;
    }
  } else if (item.slot === 'weapon' && slot === 'weapon') {
    if (item.weaponKind === 'bow' && !canEquipBow(save.profession)) return save;
    if (item.weaponKind === 'staff' && !canEquipStaff(save.profession)) return save;
    slot = 'weapon';
  } else if (targetSlot && targetSlot !== item.slot && !(item.slot === 'weapon' && targetSlot === 'weapon2')) {
    return save;
  } else {
    slot = item.slot;
  }

  if (
    ['head', 'body', 'legs', 'gloves'].includes(slot) &&
    item.armorType &&
    !canEquipArmorType(save.profession, item.armorType)
  ) {
    return save;
  }

  const idx = save.inventory.indexOf(itemId);
  if (idx < 0) return save;
  const peeked = peekInventoryIndex(save, idx);
  const incomingLevel = peeked?.enchant ?? 0;

  let next = removeInventoryIndexFromSave(save, idx);
  if (!next) return save;

  const equipment = { ...next.equipment };
  const eqEnchants = { ...next.equipmentEnchants };

  const returnToBag = (offId: string, enchant: number) => {
    next = appendEntryToSave(next!, { itemId: offId, enchant });
  };

  const previous = equipment[slot] ?? null;
  if (previous) {
    returnToBag(previous, eqEnchants[slot] ?? 0);
  }

  equipment[slot] = itemId;
  eqEnchants[slot] = incomingLevel;

  const takeOff = (offSlot: string): void => {
    const offId = equipment[offSlot];
    if (!offId) return;
    returnToBag(offId, eqEnchants[offSlot] ?? 0);
    equipment[offSlot] = null;
    delete eqEnchants[offSlot];
  };

  // Щит и второй клинок — взаимоисключающие
  if (slot === 'shield') takeOff('weapon2');
  if (slot === 'weapon2') takeOff('shield');

  // Основное оружие стало нелёгким / лук / посох — снять второй клинок; дальнее снимает щит
  if (slot === 'weapon') {
    const w = getItem(itemId);
    if (w?.weaponWeight !== 'light' || w?.weaponKind === 'bow' || w?.weaponKind === 'staff') {
      takeOff('weapon2');
    }
    if (w?.weaponKind === 'bow' || w?.weaponKind === 'staff') takeOff('shield');
  }

  // Щит снимает лук/посох
  if (slot === 'shield') {
    const main = equipment.weapon ? getItem(equipment.weapon) : null;
    if (main?.weaponKind === 'bow' || main?.weaponKind === 'staff') takeOff('weapon');
  }

  return applyStatsToSave({
    ...next,
    equipment,
    equipmentEnchants: eqEnchants,
  });
}

export function unequipItem(save: PlayerSave, slot: string): PlayerSave {
  const itemId = save.equipment[slot];
  if (!itemId) return save;

  const equipment = { ...save.equipment, [slot]: null };
  const eqEnchants = { ...save.equipmentEnchants };
  const level = eqEnchants[slot] ?? 0;
  delete eqEnchants[slot];

  return applyStatsToSave(
    appendEntryToSave(
      {
        ...save,
        equipment,
        equipmentEnchants: eqEnchants,
      },
      { itemId, enchant: level },
    ),
  );
}

export function cancelConflictingQuests(save: PlayerSave, flagsToSet: string[]): PlayerSave {
  const nextFlags = { ...save.questFlags };

  if (flagsToSet.includes('quest_betrayal_started') || flagsToSet.includes('quest_betrayal_active')) {
    delete nextFlags.quest_grove_started;
    delete nextFlags.quest_grove_active;
    delete nextFlags.quest_grove_kills;
    delete nextFlags.quest_grove_complete;
  }

  if (flagsToSet.some((f) => f.startsWith('quest_grove'))) {
    delete nextFlags.quest_betrayal_started;
    delete nextFlags.quest_betrayal_active;
    delete nextFlags.quest_betrayal_kills;
    delete nextFlags.quest_betrayal_complete;
  }

  return { ...save, questFlags: nextFlags };
}
