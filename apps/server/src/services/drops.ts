import type { EnemyDropEntry, PlayerSave } from '@empery/shared';
import {
  adenaDropMultiplier,
  itemDropMultiplier,
  xpRewardMultiplier,
} from '@empery/shared';
import { getEnemy } from './enemies.js';
import { getItem } from './items.js';
import { applyStatsToSave } from './stats.js';
import { appendItemsToSave } from './inventory-bag.js';

/** Шкала шанса как в Lineage 2: 1 000 000 = 100% */
export const DROP_RATE_SCALE = 1_000_000;

export interface DropRoll {
  kind: 'item' | 'adena';
  itemId?: string;
  count: number;
}

function rollCount(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function rollEntry(entry: EnemyDropEntry, chanceMult: number): DropRoll | null {
  const effectiveChance = Math.min(
    DROP_RATE_SCALE,
    Math.floor(entry.chance * Math.max(0, chanceMult)),
  );
  if (effectiveChance <= 0) return null;

  const roll = Math.floor(Math.random() * DROP_RATE_SCALE);
  if (roll >= effectiveChance) return null;

  const count = rollCount(entry.min, entry.max);
  if (count <= 0) return null;

  if (entry.kind === 'adena' || entry.item === 'adena') {
    return { kind: 'adena', count };
  }

  if (!entry.item || !getItem(entry.item)) return null;
  return { kind: 'item', itemId: entry.item, count };
}

export function rollEnemyDrops(
  enemyType: string,
  playerLevel: number,
  enemyLevel: number,
): DropRoll[] {
  const enemy = getEnemy(enemyType);
  if (!enemy?.drops?.length) return [];

  const itemMult = itemDropMultiplier(playerLevel, enemyLevel);
  const adenaMult = adenaDropMultiplier(playerLevel, enemyLevel);

  const results: DropRoll[] = [];
  for (const entry of enemy.drops) {
    const mult = entry.kind === 'adena' || entry.item === 'adena' ? adenaMult : itemMult;
    const drop = rollEntry(entry, mult);
    if (!drop) continue;
    if (drop.kind === 'adena' && adenaMult > 0) {
      results.push({
        ...drop,
        count: Math.max(1, Math.floor(drop.count * adenaMult)),
      });
    } else {
      results.push(drop);
    }
  }
  return results;
}

export function applyDrops(
  save: PlayerSave,
  drops: DropRoll[],
): { save: PlayerSave; drops: DropRoll[] } {
  if (drops.length === 0) return { save, drops: [] };

  const itemIds: string[] = [];
  let adena = save.adena ?? 0;

  for (const drop of drops) {
    if (drop.kind === 'adena') {
      adena += drop.count;
      continue;
    }
    if (!drop.itemId) continue;
    for (let i = 0; i < drop.count; i += 1) {
      itemIds.push(drop.itemId);
    }
  }

  const withItems = itemIds.length ? appendItemsToSave(save, itemIds) : save;
  return {
    save: applyStatsToSave({ ...withItems, adena }),
    drops,
  };
}

export { xpRewardMultiplier };
