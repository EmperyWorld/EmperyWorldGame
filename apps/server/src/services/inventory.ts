import type { PlayerSave } from '@empery/shared';
import { equipItem } from './quests.js';
import { getItem } from './items.js';
import { computeStats, type PlayerStats } from './stats.js';

export interface StatSnapshot {
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  maxHp: number;
  accuracy: number;
  evasion: number;
  critRate: number;
  attackDelayMs: number;
  attackSpeed: number;
}

export interface EquipPreview {
  itemId: string;
  slot: string;
  replaces: string | null;
  current: StatSnapshot;
  preview: StatSnapshot;
  delta: StatSnapshot;
}

function snapshot(stats: PlayerStats): StatSnapshot {
  return {
    pAtk: stats.pAtk,
    pDef: stats.pDef,
    mAtk: stats.mAtk,
    mDef: stats.mDef,
    maxHp: stats.maxHp,
    accuracy: stats.accuracy,
    evasion: stats.evasion,
    critRate: stats.critRate,
    attackDelayMs: stats.attackDelayMs,
    attackSpeed: stats.attackSpeed,
  };
}

function statDelta(current: StatSnapshot, preview: StatSnapshot): StatSnapshot {
  return {
    pAtk: preview.pAtk - current.pAtk,
    pDef: preview.pDef - current.pDef,
    mAtk: preview.mAtk - current.mAtk,
    mDef: preview.mDef - current.mDef,
    maxHp: preview.maxHp - current.maxHp,
    accuracy: preview.accuracy - current.accuracy,
    evasion: preview.evasion - current.evasion,
    critRate: preview.critRate - current.critRate,
    attackDelayMs: preview.attackDelayMs - current.attackDelayMs,
    attackSpeed: preview.attackSpeed - current.attackSpeed,
  };
}

/** Превью статов при экипировке предмета из рюкзака (без сохранения). */
export function previewEquip(save: PlayerSave, itemId: string): EquipPreview | null {
  const item = getItem(itemId);
  if (!item || item.slot === 'material' || item.slot === 'consumable') return null;
  if (!save.inventory.includes(itemId)) return null;

  const current = snapshot(computeStats(save));
  const previewSave = equipItem(save, itemId);
  const preview = snapshot(computeStats(previewSave));

  return {
    itemId,
    slot: item.slot,
    replaces: save.equipment[item.slot] ?? null,
    current,
    preview,
    delta: statDelta(current, preview),
  };
}
