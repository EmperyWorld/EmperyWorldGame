import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { contentRoot } from './paths.js';

export type SurvivalStationKind = 'campfire' | 'hearth' | 'water' | 'pot';

export interface SurvivalCraftRecipe {
  id: string;
  name: string;
  needs: string[];
  gives?: string | null;
  preserve?: string[];
  requiresWaterSource?: boolean;
  /** Player must be near one of these station kinds (empty = anywhere). */
  requiresStation?: SurvivalStationKind[];
  effect?: 'warm' | 'stabilize';
  message: string;
}

let cache: SurvivalCraftRecipe[] | null = null;

function isRecipe(raw: unknown): raw is SurvivalCraftRecipe {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as SurvivalCraftRecipe;
  return Boolean(r.id && r.name && Array.isArray(r.needs) && typeof r.message === 'string');
}

/** Field processing recipes (water/cook/fire). Separate from town leather crafts. */
export function loadSurvivalCrafts(force = false): SurvivalCraftRecipe[] {
  if (cache && !force) return cache;
  const dir = join(contentRoot, 'crafts');
  const recipes: SurvivalCraftRecipe[] = [];
  if (!existsSync(dir)) {
    cache = recipes;
    return recipes;
  }
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const docs = parseAllDocuments(readFileSync(join(dir, name), 'utf8'));
    for (const doc of docs) {
      const raw = doc.toJSON();
      if (!isRecipe(raw)) continue;
      // Town crafts use `result` + `ingredients`; skip those.
      if ((raw as { result?: string }).result && (raw as { ingredients?: unknown }).ingredients) continue;
      const requiresStation = Array.isArray(raw.requiresStation)
        ? (raw.requiresStation as string[]).filter((k): k is SurvivalStationKind =>
            ['campfire', 'hearth', 'water', 'pot'].includes(k),
          )
        : undefined;
      recipes.push({
        id: raw.id,
        name: raw.name,
        needs: raw.needs.map(String),
        gives: raw.gives ?? null,
        preserve: raw.preserve?.map(String),
        requiresWaterSource: Boolean(raw.requiresWaterSource),
        requiresStation,
        effect: raw.effect === 'warm' || raw.effect === 'stabilize' ? raw.effect : undefined,
        message: raw.message,
      });
    }
  }
  cache = recipes;
  return recipes;
}

export function getSurvivalCraft(id: string): SurvivalCraftRecipe | undefined {
  return loadSurvivalCrafts().find((recipe) => recipe.id === id);
}

export function nearbyStationKinds(
  stations: Array<{ kind: string; x: number; y: number; radius?: number }> | undefined,
  x: number,
  y: number,
): Set<SurvivalStationKind> {
  const out = new Set<SurvivalStationKind>();
  for (const station of stations ?? []) {
    if (!['campfire', 'hearth', 'water', 'pot'].includes(station.kind)) continue;
    const radius = station.radius ?? 140;
    if (Math.hypot(x - station.x, y - station.y) <= radius) {
      out.add(station.kind as SurvivalStationKind);
    }
  }
  // Russian stove / hearth is a full cooking fire — treat as campfire for recipes.
  if (out.has('hearth')) out.add('campfire');
  if (out.has('campfire')) out.add('hearth');
  return out;
}

/**
 * Private housing: authored stations are usable anywhere in the flat
 * (pechka / sink), not only inside a tight radius.
 */
export function withHomeHearthAccess(
  location: { privateOwnerOnly?: boolean; stations?: Array<{ kind: string }> } | undefined,
  near: Set<SurvivalStationKind>,
): Set<SurvivalStationKind> {
  if (!location?.privateOwnerOnly) return near;
  const out = new Set(near);
  let any = false;
  for (const station of location.stations ?? []) {
    if (!['campfire', 'hearth', 'water', 'pot'].includes(station.kind)) continue;
    out.add(station.kind as SurvivalStationKind);
    any = true;
  }
  if (!any) return near;
  if (out.has('hearth')) out.add('campfire');
  if (out.has('campfire')) out.add('hearth');
  return out;
}

/** Permanent hearth fire: no firestarter/fuel; light_fire at hearth is just warming. */
export function survivalNeedsAtStations(
  recipe: SurvivalCraftRecipe,
  nearStations: Set<SurvivalStationKind> | undefined,
): string[] {
  let needs = [...recipe.needs];
  const atHearth = Boolean(nearStations?.has('hearth'));
  if (!atHearth) return needs;
  needs = needs.filter((id) => id !== 'firestarter' && id !== 'camp_fuel');
  return needs;
}
