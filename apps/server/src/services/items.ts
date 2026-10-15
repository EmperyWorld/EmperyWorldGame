import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { parseItemContent } from '@empery/shared';
import { contentRoot } from './paths.js';

export interface ItemDefinition {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  stats: Record<string, number>;
  icon?: string;
  /** Масса, кг (иначе defaultItemWeightKg). */
  weight?: number;
  weaponWeight?: 'light' | 'normal' | 'heavy';
  weaponKind?: 'melee' | 'bow' | 'staff';
  attackRange?: number;
  armorType?: 'light' | 'heavy' | 'robe';
  /** Нельзя продать торговцу. */
  unsellable?: boolean;
  description?: string;
  /** Survival-Life properties. Undefined means an ordinary non-perishable item. */
  survival?: {
    nutrition?: number;
    hydration?: number;
    /** Base shelf life in real-time hours; freshness is evaluated lazily. */
    shelfLifeHours?: number;
    waterQuality?: 'dirty' | 'filtered' | 'boiled' | 'clean';
    rawFood?: boolean;
    warming?: number;
    /** 0–100 clothing insulation; body/head/cloak stack against cold. */
    insulation?: number;
    fuel?: number;
    tool?: 'filter' | 'pot' | 'firestarter' | 'bandage' | 'antibiotic' | 'antipyretic';
    illnessChance?: number;
  };
}

let itemsList: ItemDefinition[] | null = null;
let itemsById: Map<string, ItemDefinition> | null = null;

function ensureItemsCache(): void {
  if (itemsList && itemsById) return;
  const dir = join(contentRoot, 'items');
  const items: ItemDefinition[] = [];
  const byId = new Map<string, ItemDefinition>();

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.yaml')) continue;
    const docs = parseAllDocuments(readFileSync(join(dir, name), 'utf8'));
    for (const doc of docs) {
      const raw = doc.toJSON();
      const parsed = parseItemContent(raw);
      if (!parsed.ok) {
        console.warn(`[items] skip ${name}: ${parsed.error}`);
        continue;
      }
      const item = parsed.data as ItemDefinition;
      items.push(item);
      byId.set(item.id, item);
    }
  }

  itemsList = items;
  itemsById = byId;
}

export function loadItems(): ItemDefinition[] {
  ensureItemsCache();
  return itemsList!;
}

export function getItem(id: string): ItemDefinition | undefined {
  ensureItemsCache();
  return itemsById!.get(id);
}

/** Tests / hot-reload — drop cached YAML. */
export function clearItemsCache(): void {
  itemsList = null;
  itemsById = null;
}
