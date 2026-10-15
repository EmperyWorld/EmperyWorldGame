import type { InventoryEntry, PlayerSave } from '@empery/shared';
import {
  addEntry,
  newInventoryEntryId,
  reconcileInventoryEntries,
  removeEntryAtFlattenedIndex,
  removeOneEntry,
  withInventoryEntries,
} from '@empery/shared';
import { getItem } from './items.js';
import { markFreshnessForNewInventory } from './survival.js';

function entriesOf(save: PlayerSave): InventoryEntry[] {
  return reconcileInventoryEntries(save.inventory, save.inventoryEnchants, save.inventoryEntries);
}

function stampBag(save: PlayerSave, entries: InventoryEntry[], now = Date.now()): PlayerSave {
  const next = { ...save, ...withInventoryEntries(entries) };
  return markFreshnessForNewInventory(save, next, now);
}

/** Append item copies with instance metadata; keeps flattened inventory views in sync. */
export function appendItemsToSave(save: PlayerSave, itemIds: string[], now = Date.now()): PlayerSave {
  let entries = entriesOf(save);
  const stamp = new Date(now).toISOString();
  for (const itemId of itemIds) {
    const life = getItem(itemId)?.survival?.shelfLifeHours;
    entries = addEntry(entries, {
      id: newInventoryEntryId(now),
      itemId,
      quantity: 1,
      acquiredAt: stamp,
      freshness: life ? 100 : undefined,
      waterQuality: getItem(itemId)?.survival?.waterQuality,
    });
  }
  return stampBag(save, entries, now);
}

export function appendEntryToSave(
  save: PlayerSave,
  incoming: Omit<InventoryEntry, 'id' | 'quantity'> & { id?: string; quantity?: number },
  now = Date.now(),
): PlayerSave {
  const entries = addEntry(entriesOf(save), {
    id: incoming.id ?? newInventoryEntryId(now),
    itemId: incoming.itemId,
    quantity: Math.max(1, incoming.quantity ?? 1),
    enchant: incoming.enchant,
    acquiredAt: incoming.acquiredAt ?? new Date(now).toISOString(),
    freshness: incoming.freshness,
    temperature: incoming.temperature,
    waterQuality: incoming.waterQuality,
  });
  return stampBag(save, entries, now);
}

export function removeInventoryIndexFromSave(save: PlayerSave, flatIndex: number): PlayerSave | null {
  const next = removeEntryAtFlattenedIndex(entriesOf(save), flatIndex);
  if (!next) return null;
  return { ...save, ...withInventoryEntries(next) };
}

/** Peek flattened bag metadata for a given inventory index. */
export function peekInventoryIndex(
  save: PlayerSave,
  flatIndex: number,
): { itemId: string; enchant: number; entry: InventoryEntry } | null {
  let cursor = 0;
  for (const entry of entriesOf(save)) {
    const qty = Math.max(1, Math.floor(entry.quantity || 1));
    if (flatIndex < cursor + qty) {
      return { itemId: entry.itemId, enchant: entry.enchant ?? 0, entry };
    }
    cursor += qty;
  }
  return null;
}

/** Remove one copy of each listed itemId (order = consumption order). */
export function removeItemIdsFromSave(save: PlayerSave, itemIds: string[]): PlayerSave | null {
  let entries = entriesOf(save);
  for (const itemId of itemIds) {
    const next = removeOneEntry(entries, itemId);
    if (!next) return null;
    entries = next;
  }
  return { ...save, ...withInventoryEntries(entries) };
}

/** Replace bag wholesale while preserving entry shape. */
export function setInventoryEntriesOnSave(save: PlayerSave, entries: InventoryEntry[]): PlayerSave {
  return { ...save, ...withInventoryEntries(entries) };
}
