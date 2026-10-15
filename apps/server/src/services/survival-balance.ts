import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { contentRoot } from './paths.js';

export interface SurvivalBalance {
  drain: {
    satietyPerHour: number;
    hydrationPerHour: number;
    fatiguePerHour: number;
    restFatiguePerHour: number;
  };
  offline: { maxCatchUpHours: number; allowCritical: boolean };
  spoilage: {
    hotAboveC: number;
    hotFactor: number;
    coldBelowC: number;
    coldFactor: number;
    humidityDivisor: number;
  };
  risk: {
    dirtyWater: number;
    rawFood: number;
    spoiledBelowFreshness: number;
    spoiled: number;
  };
  tick: { intervalMs: number };
}

const DEFAULT_BALANCE: SurvivalBalance = {
  drain: {
    satietyPerHour: 4.5,
    hydrationPerHour: 7,
    fatiguePerHour: 6,
    restFatiguePerHour: -32,
  },
  offline: { maxCatchUpHours: 12, allowCritical: false },
  spoilage: {
    hotAboveC: 24,
    hotFactor: 1.5,
    coldBelowC: 5,
    coldFactor: 0.65,
    humidityDivisor: 250,
  },
  risk: {
    dirtyWater: 0.55,
    rawFood: 0.4,
    spoiledBelowFreshness: 20,
    spoiled: 0.7,
  },
  tick: { intervalMs: 60_000 },
};

let cache: SurvivalBalance | null = null;

export function loadSurvivalBalance(force = false): SurvivalBalance {
  if (cache && !force) return cache;
  try {
    const raw = parseYaml(readFileSync(join(contentRoot, 'world/survival-balance.yaml'), 'utf8')) as Partial<SurvivalBalance>;
    cache = {
      drain: { ...DEFAULT_BALANCE.drain, ...raw.drain },
      offline: { ...DEFAULT_BALANCE.offline, ...raw.offline },
      spoilage: { ...DEFAULT_BALANCE.spoilage, ...raw.spoilage },
      risk: { ...DEFAULT_BALANCE.risk, ...raw.risk },
      tick: { ...DEFAULT_BALANCE.tick, ...raw.tick },
    };
  } catch {
    cache = DEFAULT_BALANCE;
  }
  return cache;
}

/** Deterministic 0..1 roll from seed string (no Math.random in survival risks). */
export function survivalRoll(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}
