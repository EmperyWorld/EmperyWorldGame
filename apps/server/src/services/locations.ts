import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { PlayerSave } from '@empery/shared';
import { parseLocationContent } from '@empery/shared';
import { contentRoot } from './paths.js';

export interface LocationNpc {
  id: string;
  x: number;
  y: number;
  label: string;
  world?: {
    role: 'character' | 'prop';
    wanderRadius?: number;
    wanderSpeed?: number;
  };
}

export interface LocationZone {
  x: number;
  y: number;
  label: string;
  color?: string;
  travelTo?: string;
  /** Authored arrival on this map when entering through the reverse edge. */
  arrival?: { x: number; y: number };
  radius?: number;
}

export interface LocationLandmark {
  kind: string;
  x: number;
  y: number;
}

export interface LocationEnemySpawn {
  type: string;
  x: number;
  y: number;
  quest?: boolean;
  /** Фиксированный уровень; иначе берётся level из YAML врага. */
  level?: number;
}

export interface LocationQuestSpawn {
  activeFlag: string;
  killCounterFlag?: string;
  banner?: string;
  startBanner?: string;
  enemies: LocationEnemySpawn[];
}

export interface LocationQuestComplete {
  anyFlag: string[];
  banner: string;
}

export interface LocationFarmSpawn {
  type: string;
  maxAlive: number;
  respawnMs?: number;
  /** Фиксированный уровень фарма; иначе level типа. */
  level?: number;
  points: Array<{ x: number; y: number }>;
}

export interface LocationDefinition {
  id: string;
  name: string;
  description: string;
  subtitle?: string;
  mapKey: string;
  backgroundAsset: string;
  safeZone?: boolean;
  /** Private per-save instance (apartment). Multiplayer channel = locationId#saveId. */
  privateOwnerOnly?: boolean;
  /** Environmental baseline. Omitted legacy locations use temperate defaults. */
  survivalClimate?: {
    temperatureC?: number;
    humidity?: number;
    shelter?: number;
    water?: 'none' | 'dirty' | 'clean';
    heatSources?: Array<{ x: number; y: number; radius?: number }>;
  };
  /** Interactive survival stations (separate from visual landmarks). */
  stations?: Array<{
    id: string;
    kind: 'campfire' | 'hearth' | 'water' | 'pot';
    x: number;
    y: number;
    radius?: number;
  }>;
  /** Port seagull interact points (secret tame). */
  seagulls?: Array<{ id: string; x: number; y: number }>;
  /** Tier аномалии 1–4 (мир разделён на зоны). */
  anomalyTier?: number;
  /** outdoor | indoor | dungeon — освещение локации. */
  dayNight?: 'outdoor' | 'indoor' | 'dungeon';
  tierLabel?: string;
  recommendedLevel?: { min: number; max: number };
  spawn: { x: number; y: number };
  requires?: { anyFlag?: string[]; denyMessage?: string };
  raceHint?: string;
  npcs?: LocationNpc[];
  zones?: LocationZone[];
  landmarks?: LocationLandmark[];
  enemies?: LocationEnemySpawn[];
  farmSpawn?: LocationFarmSpawn;
  questSpawns?: LocationQuestSpawn[];
  questComplete?: LocationQuestComplete[];
}

let locationsList: LocationDefinition[] | null = null;
let locationsById: Map<string, LocationDefinition> | null = null;

function ensureLocationsCache(): void {
  if (locationsList && locationsById) return;
  const dir = join(contentRoot, 'locations');
  const out: LocationDefinition[] = [];
  const byId = new Map<string, LocationDefinition>();
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const raw = parseYaml(readFileSync(join(dir, name), 'utf8'));
    const parsed = parseLocationContent(raw);
    if (!parsed.ok) {
      console.warn(`[locations] skip ${name}: ${parsed.error}`);
      continue;
    }
    const loc = parsed.data as LocationDefinition;
    loc.npcs = (loc.npcs ?? []).map((npc) => enrichNpcWorld(npc));
    out.push(loc);
    byId.set(loc.id, loc);
  }
  locationsList = out;
  locationsById = byId;
}

export function loadLocations(): LocationDefinition[] {
  ensureLocationsCache();
  return locationsList!;
}

function enrichNpcWorld(npc: LocationNpc): LocationNpc {
  if (npc.world) return npc;
  const path = join(contentRoot, `npcs/${npc.id}.yaml`);
  try {
    const raw = parseYaml(readFileSync(path, 'utf8')) as {
      world?: LocationNpc['world'];
    };
    if (raw.world?.role === 'character' || raw.world?.role === 'prop') {
      return { ...npc, world: raw.world };
    }
  } catch {
    /* NPC file optional for landmarks */
  }
  if (npc.id.startsWith('apartment_')) {
    return { ...npc, world: { role: 'prop' } };
  }
  return { ...npc, world: { role: 'character' } };
}

export function getLocation(id: string): LocationDefinition | undefined {
  ensureLocationsCache();
  return locationsById!.get(id);
}

/** Tests / hot-reload — drop cached YAML. */
export function clearLocationsCache(): void {
  locationsList = null;
  locationsById = null;
}

/** Точка появления при travel: у портала обратно на fromLocation, иначе дефолтный spawn. */
export function arrivalSpawnForTravel(
  fromLocationId: string,
  dest: LocationDefinition,
): { x: number; y: number } {
  const portal = dest.zones?.find((z) => z.travelTo === fromLocationId);
  if (!portal) return { ...dest.spawn };

  if (portal.arrival) return { ...portal.arrival };

  // Сдвиг внутрь карты, чтобы не спавниться на пэде (промпт [E] сразу у ног).
  const inset = Math.max(160, (portal.radius ?? 56) * 1.2);
  const dx = dest.spawn.x - portal.x;
  const dy = dest.spawn.y - portal.y;
  const len = Math.hypot(dx, dy);
  // A coincident pad has no inward vector; keep the authored clear spawn.
  if (len < 1) return { ...dest.spawn };
  return {
    x: Math.round(portal.x + (dx / len) * inset),
    y: Math.round(portal.y + (dy / len) * inset),
  };
}

export function canTravel(save: PlayerSave, locationId: string): { ok: boolean; reason?: string } {
  const loc = getLocation(locationId);
  if (!loc) return { ok: false, reason: 'Неизвестная локация' };

  if (save.location === locationId) {
    return { ok: false, reason: 'Вы уже здесь' };
  }

  const from = getLocation(save.location);
  if (!from) {
    return { ok: false, reason: 'Текущая локация не найдена' };
  }
  const hasPortal = (from.zones ?? []).some((zone) => zone.travelTo === locationId);
  if (!hasPortal) {
    return { ok: false, reason: 'Отсюда нет прямого перехода' };
  }

  if (loc.privateOwnerOnly) {
    if (!save.housing) {
      return { ok: false, reason: 'Сначала купи квартиру у дворецкого в Гавани' };
    }
  }

  const flags = loc.requires?.anyFlag ?? [];
  if (flags.length > 0 && !flags.some((f) => Boolean(save.questFlags[f]))) {
    return {
      ok: false,
      reason: loc.requires?.denyMessage ?? 'Путь ещё закрыт — сначала выполни связанный квест',
    };
  }

  return { ok: true };
}

/**
 * WS `join_location` may only attach presence to the save's current map.
 * Changing location still requires HTTP `/travel` (flags, spawn, encounter invalidate).
 */
export function authorizeJoinLocation(
  save: PlayerSave,
  locationId: string,
): { ok: boolean; reason?: string } {
  if (save.location === locationId) return { ok: true };
  const check = canTravel(save, locationId);
  if (!check.ok) return check;
  return { ok: false, reason: 'Сначала используй переход' };
}

export function homelandForRace(race: string): string | undefined {
  if (race === 'human') return 'empery_haven';
  if (race === 'elf') return 'silverwood';
  if (race === 'orc') return 'ash_highlands';
  return undefined;
}

/** Город воскрешения — безопасная Гавань. */
export const RESPAWN_TOWN_ID = 'empery_haven';

export function respawnTownLocation(): LocationDefinition | undefined {
  return getLocation(RESPAWN_TOWN_ID);
}
