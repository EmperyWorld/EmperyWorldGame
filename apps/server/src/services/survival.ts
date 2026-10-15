import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  InventoryEntry,
  PlayerSave,
  SurvivalCondition,
  SurvivalConditionId,
  SurvivalEvent,
  SurvivalSeverity,
  SurvivalState,
} from '@empery/shared';
import {
  addEntry,
  newInventoryEntryId,
  reconcileInventoryEntries,
  removeOneEntry,
  hasSurvivalInjury,
  SURVIVAL_COLLAPSE_CAUSE_PREFIX,
  SURVIVAL_DOOM_CAUSE_PREFIX,
  withInventoryEntries,
} from '@empery/shared';
import { getItem } from './items.js';
import { getLocation, type LocationDefinition } from './locations.js';
import { contentRoot } from './paths.js';
import {
  getSurvivalCraft,
  survivalNeedsAtStations,
  type SurvivalStationKind,
} from './processing.js';
import { conditionDisplayName, conditionStatMultipliers, treatmentRemoves } from './medical.js';
import { loadSurvivalBalance, survivalRoll } from './survival-balance.js';
import type { DayNightService } from './day-night.js';

const NORMAL_TEMP = 37;
const DAY_MS = 24 * 60 * 60 * 1000;

function maxOfflineMs(): number {
  return Math.max(1, loadSurvivalBalance().offline.maxCatchUpHours) * 60 * 60 * 1000;
}

function tickMs(): number {
  return Math.max(5_000, loadSurvivalBalance().tick.intervalMs);
}

export interface WorldWeather {
  id: 'clear' | 'rain' | 'storm' | 'heatwave' | 'cold_snap';
  name: string;
  temperatureDelta: number;
  humidity: number;
  wetnessPerHour: number;
}

export interface WeatherSeason {
  id: string;
  name: string;
  durationDays: number;
  weights: Partial<Record<WorldWeather['id'], number>>;
}

export interface WeatherForecastEntry {
  at: string;
  weather: WorldWeather;
  season: { id: string; name: string };
}

interface WeatherCatalog {
  changeIntervalMinutes?: number;
  states?: WorldWeather[];
  seasons?: WeatherSeason[];
}

const DEFAULT_WEATHER: WorldWeather = {
  id: 'clear',
  name: 'Ясно',
  temperatureDelta: 0,
  humidity: 35,
  wetnessPerHour: -8,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function iso(now: number): string {
  return new Date(now).toISOString();
}

function initialSurvival(now = Date.now()): SurvivalState {
  return {
    version: 1,
    satiety: 100,
    hydration: 100,
    bodyTemperature: NORMAL_TEMP,
    fatigue: 0,
    wetness: 0,
    conditions: [],
    events: [],
    lastSimulatedAt: iso(now),
    restingUntil: null,
    doomGraceUntil: null,
    freshnessAt: {},
  };
}

export function survivalOf(save: PlayerSave, now = Date.now()): SurvivalState {
  return save.survival ?? initialSurvival(now);
}

function climateFor(
  location: LocationDefinition | undefined,
): Required<NonNullable<LocationDefinition['survivalClimate']>> {
  const c = location?.survivalClimate;
  const id = location?.id ?? '';
  const inferredTemperature =
    id.includes('ash') ? 31 :
    id.includes('silverwood') || id.includes('shadow') || id.includes('depth') ? 7 :
    id.includes('void') || id.includes('god') || id.includes('collapse') ? 3 :
    18;
  const inferredHumidity =
    id.includes('silverwood') || id.includes('grove') ? 70 :
    id.includes('ash') ? 22 :
    id.includes('void') ? 35 :
    45;
  const fromStations = (location?.stations ?? [])
    .filter((s) => s.kind === 'campfire' || s.kind === 'hearth')
    .map((s) => ({ x: s.x, y: s.y, radius: s.radius ?? 180 }));
  return {
    temperatureC: c?.temperatureC ?? inferredTemperature,
    humidity: c?.humidity ?? inferredHumidity,
    shelter: c?.shelter ?? (location?.safeZone ? 90 : 10),
    water: c?.water ?? (location?.safeZone ? 'clean' : 'none'),
    heatSources: c?.heatSources?.length ? c.heatSources : fromStations,
  };
}

export function locationHeatSources(location: LocationDefinition | undefined) {
  return climateFor(location).heatSources;
}

function insulationFor(save: PlayerSave): number {
  return Object.values(save.equipment).reduce((total, itemId) => {
    if (!itemId) return total;
    return total + (getItem(itemId)?.survival?.insulation ?? 0);
  }, 0);
}

function pickWeighted(
  states: WorldWeather[],
  weights: Partial<Record<WorldWeather['id'], number>>,
  seed: number,
): WorldWeather {
  const bag: WorldWeather[] = [];
  for (const state of states) {
    const w = Math.max(0, Math.floor(weights[state.id] ?? 0));
    for (let i = 0; i < w; i++) bag.push(state);
  }
  if (bag.length === 0) return states[0] ?? DEFAULT_WEATHER;
  return bag[Math.abs(seed) % bag.length]!;
}

/** A single shared weather state keeps all players in the same world conditions. */
export class WeatherService {
  private readonly states: WorldWeather[];
  private readonly seasons: WeatherSeason[];
  private readonly intervalMs: number;
  private current: WorldWeather;
  private season: WeatherSeason;
  private changedAt = Date.now();
  private epoch = Date.UTC(2026, 0, 1);

  constructor() {
    let changeIntervalMinutes = 45;
    try {
      const config = parseYaml(
        readFileSync(join(contentRoot, 'world/weather.yaml'), 'utf8'),
      ) as WeatherCatalog;
      this.states = (config.states ?? []).filter((s) => s?.id && s?.name);
      this.seasons = (config.seasons ?? []).filter((s) => s?.id && s?.name);
      changeIntervalMinutes = config.changeIntervalMinutes ?? 45;
    } catch {
      this.states = [DEFAULT_WEATHER];
      this.seasons = [];
    }
    this.intervalMs = Math.max(5, changeIntervalMinutes) * 60_000;
    this.season = this.seasons[0] ?? {
      id: 'all',
      name: 'Сезон',
      durationDays: 7,
      weights: { clear: 1 },
    };
    this.current = this.states.find((s) => s.id === 'clear') ?? this.states[0] ?? DEFAULT_WEATHER;
  }

  private seasonAt(now: number): WeatherSeason {
    if (this.seasons.length === 0) return this.season;
    const totalDays = this.seasons.reduce((sum, s) => sum + Math.max(1, s.durationDays), 0);
    const day = Math.floor(Math.max(0, now - this.epoch) / DAY_MS) % totalDays;
    let cursor = 0;
    for (const season of this.seasons) {
      cursor += Math.max(1, season.durationDays);
      if (day < cursor) return season;
    }
    return this.seasons[0]!;
  }

  private weatherForSlot(slot: number, season: WeatherSeason): WorldWeather {
    return pickWeighted(this.states, season.weights, slot * 17 + season.id.length * 13);
  }

  snapshot(): WorldWeather {
    return { ...this.current };
  }

  seasonSnapshot(): { id: string; name: string } {
    return { id: this.season.id, name: this.season.name };
  }

  forecast(now = Date.now(), steps = 4): WeatherForecastEntry[] {
    const out: WeatherForecastEntry[] = [];
    const startSlot = Math.floor(now / this.intervalMs);
    for (let i = 0; i < steps; i++) {
      const at = (startSlot + i) * this.intervalMs;
      const season = this.seasonAt(at);
      out.push({
        at: iso(at),
        weather: this.weatherForSlot(startSlot + i, season),
        season: { id: season.id, name: season.name },
      });
    }
    return out;
  }

  set(id: WorldWeather['id']): WorldWeather | null {
    const next = this.states.find((state) => state.id === id);
    if (!next) return null;
    this.current = next;
    this.changedAt = Date.now();
    return this.snapshot();
  }

  /** Deterministic seasonal rotation; admin override can still set a specific state. */
  refresh(now = Date.now()): WorldWeather {
    this.season = this.seasonAt(now);
    if (now - this.changedAt < this.intervalMs && this.changedAt > this.epoch) {
      return this.snapshot();
    }
    const slot = Math.floor(now / this.intervalMs);
    this.current = this.weatherForSlot(slot, this.season);
    this.changedAt = now;
    return this.snapshot();
  }
}

function severityFor(value: number, criticalAt: number, deficitAt: number): SurvivalSeverity {
  if (value <= criticalAt) return 'critical';
  if (value <= deficitAt) return 'deficit';
  return 'normal';
}

function appendEvent(events: SurvivalEvent[], event: SurvivalEvent): SurvivalEvent[] {
  const previous = events.at(-1);
  if (previous?.message === event.message && event.type === 'warning') return events;
  return [...events, event].slice(-12);
}

function upsertCondition(
  conditions: SurvivalCondition[],
  id: SurvivalConditionId,
  severity: SurvivalSeverity,
  kind: SurvivalCondition['kind'],
  now: number,
): SurvivalCondition[] {
  const other = conditions.filter((condition) => condition.id !== id);
  if (severity === 'normal') return other;
  const existing = conditions.find((condition) => condition.id === id);
  return [
    ...other,
    {
      id,
      severity,
      kind,
      startedAt: existing?.startedAt ?? iso(now),
      stage: existing?.stage ?? (kind === 'illness' ? 'mild' : undefined),
    },
  ];
}

const ILLNESS_ACUTE_HOURS = 4;

function progressIllnessStages(state: SurvivalState, now: number): SurvivalState {
  let changed = false;
  const conditions = state.conditions.map((condition) => {
    if (condition.kind !== 'illness') return condition;
    const ageHours = Math.max(0, (now - Date.parse(condition.startedAt)) / 3_600_000);
    if (ageHours >= ILLNESS_ACUTE_HOURS && condition.stage !== 'acute') {
      changed = true;
      return { ...condition, stage: 'acute' as const };
    }
    if (!condition.stage) {
      changed = true;
      return { ...condition, stage: 'mild' as const };
    }
    return condition;
  });
  if (!changed) return state;
  const beforeAcute = new Set(
    state.conditions.filter((c) => c.stage === 'acute').map((c) => c.id),
  );
  const becameAcute = conditions.some((c) => c.stage === 'acute' && !beforeAcute.has(c.id));
  return {
    ...state,
    conditions,
    events: becameAcute
      ? appendEvent(state.events, {
          at: iso(now),
          type: 'condition',
          message: 'Болезнь обострилась. Нужно лечение, иначе состояние будет хуже.',
        })
      : state.events,
  };
}

function conditionName(id: SurvivalConditionId): string {
  return conditionDisplayName(id);
}

function applyThresholdConditions(state: SurvivalState, now: number): SurvivalState {
  let conditions = state.conditions;
  const apply = (
    id: SurvivalConditionId,
    severity: SurvivalSeverity,
    kind: SurvivalCondition['kind'] = 'deficit',
  ) => {
    conditions = upsertCondition(conditions, id, severity, kind, now);
  };
  apply('hungry', severityFor(state.satiety, 8, 35));
  apply('dehydrated', severityFor(state.hydration, 8, 35));
  apply('fatigued', state.fatigue >= 92 ? 'critical' : state.fatigue >= 65 ? 'deficit' : 'normal');
  apply('hypothermia', state.bodyTemperature < 34 ? 'critical' : state.bodyTemperature < 35.5 ? 'deficit' : 'normal');
  apply('hyperthermia', state.bodyTemperature > 40 ? 'critical' : state.bodyTemperature > 38.5 ? 'deficit' : 'normal');
  return { ...state, conditions };
}

const CRITICAL_INJURY: Record<SurvivalConditionId, SurvivalConditionId> = {
  hungry: 'exhaustion_injury',
  dehydrated: 'exhaustion_injury',
  fatigued: 'exhaustion_injury',
  hypothermia: 'frostbite',
  hyperthermia: 'heatstroke',
  infection: 'exhaustion_injury',
  food_poisoning: 'exhaustion_injury',
  exhaustion_injury: 'exhaustion_injury',
  frostbite: 'frostbite',
  heatstroke: 'heatstroke',
};

function applyCriticalInjury(
  state: SurvivalState,
  criticalId: SurvivalConditionId,
  now: number,
  message: string,
): SurvivalState {
  const id = CRITICAL_INJURY[criticalId];
  if (state.conditions.some((condition) => condition.id === id && condition.kind === 'injury')) {
    return state;
  }
  return {
    ...state,
    conditions: upsertCondition(state.conditions, id, 'deficit', 'injury', now),
    events: appendEvent(state.events, {
      at: iso(now),
      type: 'condition',
      message,
    }),
  };
}

function criticalInjury(state: SurvivalState, now: number): SurvivalState {
  const critical = state.conditions.find((condition) => condition.severity === 'critical');
  if (!critical) return state;
  return applyCriticalInjury(
    state,
    critical.id,
    now,
    `Критическое состояние: ${conditionName(critical.id)}. Получена лечимая травма.`,
  );
}

export interface SurvivalTickContext {
  weather: WorldWeather;
  moving?: boolean;
  /** Safe zones reduce pressure and make resting possible. */
  safeZone?: boolean;
  /** Presence is close enough to an authored heat source (campfire/hearth). */
  nearHeatSource?: boolean;
  /**
   * Active online play may create injuries/collapse.
   * Offline catch-up only drains vitals and never kills.
   */
  activePlay?: boolean;
}

export function simulateSurvival(
  save: PlayerSave,
  context: SurvivalTickContext,
  now = Date.now(),
): PlayerSave {
  const current = survivalOf(save, now);
  const last = Date.parse(current.lastSimulatedAt);
  const elapsedMs = Math.max(0, Math.min(maxOfflineMs(), now - (Number.isFinite(last) ? last : now)));
  if (elapsedMs < 1_000) return { ...save, survival: current };
  const hours = elapsedMs / 3_600_000;
  const location = getLocation(save.location);
  const climate = climateFor(location);
  const resting = current.restingUntil && Date.parse(current.restingUntil) > now && Boolean(context.safeZone);
  const activity = context.moving ? 1.35 : 1;
  const insulation = insulationFor(save);
  const protection = clamp(
    climate.shelter + (context.safeZone ? 20 : 0) + insulation * 0.8 + (context.nearHeatSource ? 45 : 0),
    0,
    98,
  );
  const wetness = clamp(
    current.wetness + (context.weather.wetnessPerHour * hours * (1 - protection / 100)),
  );
  const external = climate.temperatureC + context.weather.temperatureDelta;
  const coldPressure = Math.max(0, 12 - external) * (1 + wetness / 100) * (1 - protection / 120);
  const heatPressure = Math.max(0, external - 28) * (1 - protection / 160);
  const balance = loadSurvivalBalance();
  let state: SurvivalState = {
    ...current,
    satiety: clamp(current.satiety - hours * balance.drain.satietyPerHour * (resting ? 0.35 : activity)),
    hydration: clamp(current.hydration - hours * balance.drain.hydrationPerHour * (resting ? 0.45 : activity) - heatPressure * hours * 0.5),
    fatigue: clamp(current.fatigue + hours * (resting ? balance.drain.restFatiguePerHour : balance.drain.fatiguePerHour * activity)),
    wetness,
    bodyTemperature: clamp(
      current.bodyTemperature +
        (NORMAL_TEMP - current.bodyTemperature) * hours * (context.nearHeatSource ? 0.8 : 0.24) -
        coldPressure * hours * 0.1 +
        heatPressure * hours * 0.08,
      30,
      43,
    ),
    lastSimulatedAt: iso(now),
    restingUntil: resting ? current.restingUntil : null,
  };
  state = applyThresholdConditions(state, now);
  if (context.activePlay) {
    state = progressIllnessStages(state, now);
    state = criticalInjury(state, now);
    const condition = state.conditions.find((entry) => entry.severity === 'critical');
    if (condition) {
      state = {
        ...state,
        events: appendEvent(state.events, {
          at: iso(now),
          type: 'warning',
          message: `Критично: ${conditionName(condition.id)}. Нужна помощь или отдых.`,
        }),
      };
    }
  } else {
    // Offline catch-up: keep deficits visible, strip fresh critical flags until the player is live.
    state = {
      ...state,
      conditions: state.conditions.filter(
        (condition) => condition.kind === 'injury' || condition.kind === 'illness' || condition.severity !== 'critical',
      ),
    };
    state = applyThresholdConditions(state, now);
    state = {
      ...state,
      conditions: state.conditions.map((condition) =>
        condition.severity === 'critical' ? { ...condition, severity: 'deficit' as const } : condition,
      ),
    };
  }
  return { ...save, survival: state };
}

export function survivalStatMultipliers(save: PlayerSave): {
  speed: number;
  accuracy: number;
  stamina: number;
  hpRegen: number;
  conditions: Array<{ id: SurvivalConditionId; severity: SurvivalSeverity }>;
  severity: SurvivalSeverity;
} {
  const state = survivalOf(save);
  const conditions = state.conditions.map(({ id, severity, stage }) => ({ id, severity, stage }));
  const critical = conditions.some((entry) => entry.severity === 'critical' || entry.stage === 'acute');
  const deficit = conditions.some((entry) => entry.severity === 'deficit');
  const injuries = conditions.filter((entry) =>
    ['exhaustion_injury', 'frostbite', 'heatstroke'].includes(entry.id),
  ).length;
  const fromData = conditionStatMultipliers(conditions);
  const fallback = {
    speed: critical ? 0.7 : deficit ? 0.88 : 1,
    accuracy: critical ? 0.72 : deficit ? 0.9 : 1,
    stamina: critical ? 0.55 : deficit ? 0.8 : 1,
    hpRegen: critical ? 0 : deficit ? 0.45 : 1,
  };
  return {
    speed: Math.min(fallback.speed, fromData.speed),
    accuracy: Math.min(fallback.accuracy, fromData.accuracy),
    stamina: Math.min(fallback.stamina, fromData.stamina),
    hpRegen: Math.min(fallback.hpRegen, fromData.hpRegen),
    conditions: conditions.map(({ id, severity }) => ({ id, severity })),
    severity: critical ? 'critical' : deficit || injuries > 0 ? 'deficit' : 'normal',
  };
}

/** Floor / cap after revive so the next live tick cannot immediately re-collapse. */
export const REVIVE_SATIETY_FLOOR = 30;
export const REVIVE_HYDRATION_FLOOR = 30;
/** Below fatigued deficit (65). */
export const REVIVE_FATIGUE_CAP = 55;
/** Two minutes after getting up: injury does not upgrade death to Гибель. */
export const DOOM_GRACE_MS = 2 * 60 * 1000;

export function isDoomGraceActive(state: SurvivalState, now = Date.now()): boolean {
  const until = state.doomGraceUntil;
  if (!until) return false;
  const at = Date.parse(until);
  return Number.isFinite(at) && at > now;
}

/** Гибель only in the field, with an untreated injury, and after the revive grace. */
export function shouldApplyDoom(save: PlayerSave, now = Date.now()): boolean {
  const state = survivalOf(save, now);
  if (!hasSurvivalInjury(state.conditions)) return false;
  if (getLocation(save.location)?.safeZone) return false;
  return !isDoomGraceActive(state, now);
}

/** Pull vitals off the collapse cliff; injuries stay until treated. */
export function stabilizeSurvivalAfterRevive(state: SurvivalState, now = Date.now()): SurvivalState {
  return applyThresholdConditions(
    {
      ...state,
      satiety: Math.max(state.satiety, REVIVE_SATIETY_FLOOR),
      hydration: Math.max(state.hydration, REVIVE_HYDRATION_FLOOR),
      fatigue: Math.min(state.fatigue, REVIVE_FATIGUE_CAP),
      doomGraceUntil: iso(now + DOOM_GRACE_MS),
    },
    now,
  );
}

/** Critical neglect: first collapse is faint; untreated injury makes the next collapse Гибель. */
export function applySurvivalCollapse(save: PlayerSave): PlayerSave {
  const state = survivalOf(save);
  const critical = state.conditions.find((condition) => condition.severity === 'critical');
  if (!critical || save.hp <= 0) return save;
  const now = Date.now();
  const doom = shouldApplyDoom(save, now);
  const injured = applyCriticalInjury(
    state,
    critical.id,
    now,
    doom
      ? `Гибель: ${conditionName(critical.id)}. Повторный обморок при невылеченной травме.`
      : `Обморок: ${conditionName(critical.id)}. Травма до лечения; вне города следующий обморок — Гибель.`,
  );
  return {
    ...save,
    hp: 0,
    lastDeathKind: doom ? 'doom' : 'faint',
    lastDeathCause: doom
      ? `${SURVIVAL_DOOM_CAUSE_PREFIX}: ${conditionName(critical.id)}. Повторный обморок при невылеченной травме.`
      : `${SURVIVAL_COLLAPSE_CAUSE_PREFIX}: ${conditionName(critical.id)}. После воскрешения потребуется лечение.`,
    survival: injured,
  };
}

export interface SurvivalActionResult {
  ok: boolean;
  save: PlayerSave;
  message: string;
}

function entriesOf(save: PlayerSave): InventoryEntry[] {
  return reconcileInventoryEntries(save.inventory, save.inventoryEnchants, save.inventoryEntries);
}

function freshnessPercent(save: PlayerSave, itemId: string, now: number): number {
  const life = getItem(itemId)?.survival?.shelfLifeHours;
  if (!life) return 100;
  const spoil = loadSurvivalBalance().spoilage;
  const entries = entriesOf(save);
  const entry = entries.find((e) => e.itemId === itemId);
  if (typeof entry?.freshness === 'number') {
    return clamp(entry.freshness);
  }
  const state = survivalOf(save, now);
  const createdAt = entry?.acquiredAt ?? state.freshnessAt?.[itemId] ?? iso(now);
  const age = Math.max(0, now - Date.parse(createdAt));
  const climate = climateFor(getLocation(save.location));
  const temperatureFactor =
    climate.temperatureC > spoil.hotAboveC
      ? spoil.hotFactor
      : climate.temperatureC < spoil.coldBelowC
        ? spoil.coldFactor
        : 1;
  const humidityFactor = 1 + climate.humidity / spoil.humidityDivisor;
  return clamp(100 - (age / 3_600_000 / life) * 100 * temperatureFactor * humidityFactor);
}

/** Lazy spoilage pass: rewrite entry freshness from age + climate. */
export function spoilInventoryEntries(save: PlayerSave, now = Date.now()): PlayerSave {
  const spoil = loadSurvivalBalance().spoilage;
  const climate = climateFor(getLocation(save.location));
  const temperatureFactor =
    climate.temperatureC > spoil.hotAboveC
      ? spoil.hotFactor
      : climate.temperatureC < spoil.coldBelowC
        ? spoil.coldFactor
        : 1;
  const humidityFactor = 1 + climate.humidity / spoil.humidityDivisor;
  let changed = false;
  const entries = entriesOf(save).map((entry) => {
    const life = getItem(entry.itemId)?.survival?.shelfLifeHours;
    if (!life) return entry;
    const createdAt = entry.acquiredAt ?? iso(now);
    const age = Math.max(0, now - Date.parse(createdAt));
    const freshness = clamp(100 - (age / 3_600_000 / life) * 100 * temperatureFactor * humidityFactor);
    if (entry.freshness !== undefined && Math.abs(entry.freshness - freshness) < 0.5) return entry;
    changed = true;
    return { ...entry, freshness, acquiredAt: createdAt };
  });
  if (!changed) return save;
  return { ...save, ...withInventoryEntries(entries) };
}

/** Snapshot current freshness for fridge deposit (stops clock while stored). */
export function snapshotEntryFreshness(save: PlayerSave, entry: InventoryEntry, now = Date.now()): InventoryEntry {
  const life = getItem(entry.itemId)?.survival?.shelfLifeHours;
  if (!life) return entry;
  const freshness = freshnessPercent(
    { ...save, ...withInventoryEntries([entry]) } as PlayerSave,
    entry.itemId,
    now,
  );
  return { ...entry, freshness, acquiredAt: entry.acquiredAt ?? iso(now) };
}

/** Resume spoilage clock from preserved freshness after fridge withdraw. */
export function thawFridgeEntry(entry: InventoryEntry, now = Date.now()): InventoryEntry {
  const life = getItem(entry.itemId)?.survival?.shelfLifeHours;
  if (!life) return entry;
  const freshness = typeof entry.freshness === 'number' ? clamp(entry.freshness) : 100;
  const ageMs = ((100 - freshness) / 100) * life * 3_600_000;
  return { ...entry, freshness, acquiredAt: iso(now - ageMs) };
}

/** Stamps newly acquired perishables without changing compact legacy inventory slots. */
export function markFreshnessForNewInventory(
  before: PlayerSave,
  after: PlayerSave,
  now = Date.now(),
): PlayerSave {
  const state = survivalOf(after, now);
  const was = new Set(before.inventory);
  const freshnessAt = { ...state.freshnessAt };
  let entries = entriesOf(after);
  let changed = false;
  entries = entries.map((entry) => {
    if (was.has(entry.itemId) || !getItem(entry.itemId)?.survival?.shelfLifeHours) return entry;
    if (!freshnessAt[entry.itemId]) freshnessAt[entry.itemId] = iso(now);
    if (entry.freshness !== undefined && entry.acquiredAt) return entry;
    changed = true;
    return { ...entry, freshness: 100, acquiredAt: entry.acquiredAt ?? iso(now) };
  });
  const bag = changed ? withInventoryEntries(entries) : after;
  return {
    ...after,
    ...bag,
    survival: { ...state, freshnessAt },
  };
}

export function consumeSurvivalItem(save: PlayerSave, itemId: string, now = Date.now()): SurvivalActionResult {
  const spoiled = spoilInventoryEntries(save, now);
  const item = getItem(itemId);
  const props = item?.survival;
  const entries = removeOneEntry(entriesOf(spoiled), itemId);
  if (!item || !props || !entries) {
    return { ok: false, save, message: 'Этот предмет нельзя использовать для выживания.' };
  }
  const bag = withInventoryEntries(entries);
  const next = simulateSurvival(
    { ...spoiled, ...bag },
    { weather: DEFAULT_WEATHER, safeZone: getLocation(save.location)?.safeZone, activePlay: true },
    now,
  );
  let state = survivalOf(next, now);
  state = {
    ...state,
    satiety: clamp(state.satiety + (props.nutrition ?? 0)),
    hydration: clamp(state.hydration + (props.hydration ?? 0)),
    bodyTemperature: clamp(state.bodyTemperature + (props.warming ?? 0), 30, 43),
  };
  const freshness = freshnessPercent(spoiled, itemId, now);
  const riskCfg = loadSurvivalBalance().risk;
  const risks: SurvivalConditionId[] = [];
  const seedBase = `${save.id}|${itemId}|${Math.floor(now / 60_000)}`;
  const maybe = (chance: number, id: SurvivalConditionId, tag: string) => {
    const roll = survivalRoll(`${seedBase}|${tag}`);
    if (roll < chance) risks.push(id);
    state = {
      ...state,
      events: appendEvent(state.events, {
        at: iso(now),
        type: 'warning',
        message: `Риск (${tag}): roll=${roll.toFixed(3)} / ${chance.toFixed(2)} → ${roll < chance ? 'болезнь' : 'чисто'}`,
      }),
    };
  };
  if (props.waterQuality === 'dirty') {
    maybe(props.illnessChance ?? riskCfg.dirtyWater, 'infection', 'dirty_water');
  }
  if (props.rawFood) {
    maybe(props.illnessChance ?? riskCfg.rawFood, 'food_poisoning', 'raw_food');
  }
  if (freshness < riskCfg.spoiledBelowFreshness && (props.nutrition || props.hydration)) {
    maybe(riskCfg.spoiled, 'food_poisoning', 'spoiled');
  }
  for (const risk of risks) {
    state = {
      ...state,
      conditions: upsertCondition(state.conditions, risk, 'deficit', 'illness', now),
    };
  }
  state = {
    ...state,
    events: appendEvent(state.events, {
      at: iso(now),
      type: 'consumed',
      message: risks.length
        ? `${item.name}: утоляет нужду, но есть риск заболевания${freshness < riskCfg.spoiledBelowFreshness ? ' из-за порчи' : ''}.`
        : `${item.name}: состояние улучшено.`,
    }),
  };
  return {
    ok: true,
    save: { ...next, ...bag, survival: applyThresholdConditions(state, now) },
    message: risks.length ? `Использовано: ${item.name}. Следи за самочувствием.` : `Использовано: ${item.name}.`,
  };
}

export function treatSurvival(save: PlayerSave, itemId: string, now = Date.now()): SurvivalActionResult {
  const item = getItem(itemId);
  const tool = item?.survival?.tool;
  const entries = removeOneEntry(entriesOf(save), itemId);
  if (!item || !entries || !tool) return { ok: false, save, message: 'Это не средство лечения.' };
  const bag = withInventoryEntries(entries);
  const remove = treatmentRemoves(tool);
  if (!remove.length) return { ok: false, save, message: 'Этот инструмент не лечит заболевания.' };
  const state = survivalOf(save, now);
  const conditions = state.conditions.filter((condition) => !remove.includes(condition.id));
  const clearedDoomThreat = hasSurvivalInjury(state.conditions) && !hasSurvivalInjury(conditions);
  const treatLine = clearedDoomThreat
    ? `${item.name}: травма снята, угроза Гибели спала.`
    : `${item.name}: состояние стабилизировано.`;
  return {
    ok: true,
    save: {
      ...save,
      ...bag,
      survival: {
        ...state,
        conditions,
        doomGraceUntil: clearedDoomThreat ? null : state.doomGraceUntil,
        events: appendEvent(state.events, {
          at: iso(now),
          type: 'treatment',
          message: treatLine,
        }),
      },
    },
    message: treatLine,
  };
}

export function startSurvivalRest(save: PlayerSave, now = Date.now()): SurvivalActionResult {
  return applyRestRecovery(save, now, { instantFatigueRelief: 25, restMinutes: 20 });
}

/** Instant + timed fatigue recovery (safe zone only). */
export function applyRestRecovery(
  save: PlayerSave,
  now = Date.now(),
  opts: {
    instantFatigueRelief?: number;
    restMinutes?: number;
    /** Full sleep in owned bed — also clears exhaustion injury. */
    deepSleep?: boolean;
  } = {},
): SurvivalActionResult {
  if (!getLocation(save.location)?.safeZone) {
    return { ok: false, save, message: 'Полноценно отдыхать можно только в безопасной зоне.' };
  }
  const state = survivalOf(save, now);
  const relief = opts.instantFatigueRelief ?? 25;
  const minutes = opts.restMinutes ?? 20;
  const fatigue = clamp(state.fatigue - relief);
  let conditions = state.conditions;
  if (opts.deepSleep && fatigue < 55) {
    conditions = conditions.filter((c) => c.id !== 'exhaustion_injury' && c.id !== 'fatigued');
  }
  let nextState = applyThresholdConditions(
    {
      ...state,
      fatigue,
      restingUntil: iso(now + minutes * 60_000),
      conditions,
    },
    now,
  );
  if (opts.deepSleep && fatigue < 55) {
    nextState = {
      ...nextState,
      conditions: nextState.conditions.filter((c) => c.id !== 'exhaustion_injury'),
    };
  }
  const fatigueLine =
    fatigue < 65
      ? 'усталость спала'
      : `усталость −${relief}% (осталось ${Math.round(fatigue)}%)`;
  return {
    ok: true,
    save: { ...save, survival: nextState },
    message: `Отдых: ${fatigueLine}. Ещё ~${minutes} мин восстановления, пока стоишь на месте в безопасной зоне.`,
  };
}

function consumeIngredients(entries: InventoryEntry[], ids: readonly string[]): InventoryEntry[] | null {
  let next = entries;
  for (const id of ids) {
    const removed = removeOneEntry(next, id);
    if (!removed) return null;
    next = removed;
  }
  return next;
}

function itemLabel(itemId: string): string {
  return getItem(itemId)?.name ?? itemId;
}

function missingNeedsMessage(ids: readonly string[]): string {
  if (!ids.length) return 'Не хватает ингредиентов или инструмента.';
  return `Не хватает: ${ids.map(itemLabel).join(', ')}.`;
}

type HousingStorages = NonNullable<PlayerSave['housing']>['storages'];

/** Bag first, then apartment storages (materials / food / gear). */
function consumeNeedsAtHome(
  save: PlayerSave,
  needs: readonly string[],
): { entries: InventoryEntry[]; housing?: PlayerSave['housing'] } | null {
  let bag = entriesOf(save);
  const housing = save.housing;
  if (!housing) {
    const next = consumeIngredients(bag, needs);
    return next ? { entries: next } : null;
  }
  const storages: HousingStorages = {
    materials: [...housing.storages.materials],
    gear: [...housing.storages.gear],
    food: [...housing.storages.food],
  };
  let touchedHousing = false;
  for (const id of needs) {
    const fromBag = removeOneEntry(bag, id);
    if (fromBag) {
      bag = fromBag;
      continue;
    }
    let taken = false;
    for (const kind of ['food', 'materials', 'gear'] as const) {
      const fromStore = removeOneEntry(storages[kind], id);
      if (fromStore) {
        storages[kind] = fromStore;
        touchedHousing = true;
        taken = true;
        break;
      }
    }
    if (!taken) return null;
  }
  return {
    entries: bag,
    housing: touchedHousing ? { ...housing, storages } : housing,
  };
}

function listMissingNeeds(save: PlayerSave, needs: readonly string[], allowHousing: boolean): string[] {
  const pool = [...save.inventory];
  if (allowHousing && save.housing) {
    for (const kind of ['food', 'materials', 'gear'] as const) {
      for (const entry of save.housing.storages[kind]) {
        const qty = Math.max(1, Math.floor(entry.quantity || 1));
        for (let i = 0; i < qty; i++) pool.push(entry.itemId);
      }
    }
  }
  const missing: string[] = [];
  const available = [...pool];
  for (const id of needs) {
    const at = available.indexOf(id);
    if (at < 0) missing.push(id);
    else available.splice(at, 1);
  }
  return missing;
}

export interface ProcessSurvivalOptions {
  /** When provided, recipe station requirements must intersect this set. */
  nearStations?: Set<SurvivalStationKind>;
}

/** Server-side field processing. Recipes come from content/crafts/survival.yaml. */
export function processSurvival(
  save: PlayerSave,
  recipeId: string,
  now = Date.now(),
  options: ProcessSurvivalOptions = {},
): SurvivalActionResult {
  const location = getLocation(save.location);
  const climate = climateFor(location);
  const recipe = getSurvivalCraft(recipeId);
  if (!recipe) return { ok: false, save, message: 'Неизвестный способ обработки.' };
  if (recipe.requiresWaterSource && climate.water === 'none') {
    return { ok: false, save, message: 'В этой локации нет доступного источника воды.' };
  }
  const available =
    options.nearStations ??
    new Set(
      (location?.stations ?? [])
        .map((s) => s.kind)
        .filter((k): k is SurvivalStationKind =>
          ['campfire', 'hearth', 'water', 'pot'].includes(k),
        ),
    );
  if (recipe.requiresStation?.length) {
    const ok = recipe.requiresStation.some((kind) => available.has(kind));
    if (!ok) {
      return {
        ok: false,
        save,
        message: 'Нужна подходящая станция рядом (колодец, очаг или костёр).',
      };
    }
  }
  const needs = survivalNeedsAtStations(recipe, available);
  const atHome = Boolean(location?.privateOwnerOnly && save.housing);
  const missing = listMissingNeeds(save, needs, atHome);
  if (missing.length) {
    return { ok: false, save, message: missingNeedsMessage(missing) };
  }
  const preserve = recipe.preserve ?? [];
  const consumed = needs.filter((id) => !preserve.includes(id));
  const pulled: { entries: InventoryEntry[]; housing?: PlayerSave['housing'] } | null = atHome
    ? consumeNeedsAtHome(save, consumed)
    : (() => {
        const next = consumeIngredients(entriesOf(save), consumed);
        return next ? { entries: next } : null;
      })();
  if (!pulled) return { ok: false, save, message: missingNeedsMessage(consumed) };
  let entries = pulled.entries;
  if (recipe.gives) {
    entries = addEntry(entries, {
      id: newInventoryEntryId(now),
      itemId: recipe.gives,
      quantity: 1,
      acquiredAt: iso(now),
      freshness: 100,
      waterQuality: recipe.gives.includes('water')
        ? recipe.gives.startsWith('boiled')
          ? 'boiled'
          : recipe.gives.startsWith('filtered')
            ? 'filtered'
            : 'clean'
        : undefined,
      temperature: recipe.id === 'cook_meat' || recipe.id === 'cook_fish' ? 'hot' : undefined,
    });
  }
  const bag = withInventoryEntries(entries);
  let state = survivalOf(save, now);
  if (recipe.effect === 'warm' || recipe.effect === 'stabilize') {
    state = {
      ...state,
      wetness: clamp(state.wetness - (recipe.effect === 'stabilize' ? 12 : 20)),
      bodyTemperature: clamp(
        state.bodyTemperature + (recipe.effect === 'stabilize' ? 0.35 : 0.5),
        30,
        43,
      ),
      events: appendEvent(state.events, { at: iso(now), type: 'weather', message: recipe.message }),
    };
  }
  return {
    ok: true,
    save: {
      ...save,
      ...bag,
      ...(pulled.housing ? { housing: pulled.housing } : {}),
      survival: {
        ...state,
        freshnessAt: recipe.gives
          ? { ...state.freshnessAt, [recipe.gives]: iso(now) }
          : state.freshnessAt,
      },
    },
    message: recipe.message,
  };
}

export function environmentSnapshot(
  locationId: string,
  weather: WorldWeather,
  weatherService?: WeatherService,
  dayNightService?: DayNightService,
) {
  const location = getLocation(locationId);
  const climate = climateFor(location);
  const safeZone = Boolean(location?.safeZone);
  return {
    locationId,
    weather,
    season: weatherService?.seasonSnapshot() ?? { id: 'all', name: 'Сезон' },
    forecast: weatherService?.forecast(Date.now(), 4) ?? [],
    temperatureC: climate.temperatureC + weather.temperatureDelta,
    humidity: clamp((climate.humidity + weather.humidity) / 2),
    shelter: climate.shelter,
    water: climate.water,
    stations: location?.stations ?? [],
    safeZone,
    timeOfDay: dayNightService?.snapshotForLocation(locationId) ?? undefined,
  };
}

export const SURVIVAL_TICK_MS = tickMs();
