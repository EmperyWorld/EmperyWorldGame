import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  computeBaseDayNightSnapshot,
  computeDayNightSnapshot,
  resolveDayNightProfile,
  type DayNightConfig,
  type DayNightLocationProfile,
  type DayNightSnapshot,
} from '@empery/shared';
import { contentRoot } from './paths.js';
import { getLocation } from './locations.js';

interface DayNightYaml {
  cycleMinutes?: number;
  epoch?: string;
}

const DEFAULT_CYCLE_MINUTES = 24;
const DEFAULT_EPOCH = Date.UTC(2026, 0, 1);

function parseEpoch(raw: string | undefined): number {
  if (!raw) return DEFAULT_EPOCH;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : DEFAULT_EPOCH;
}

function loadConfig(): DayNightConfig {
  let cycleMinutes = DEFAULT_CYCLE_MINUTES;
  let epochMs = DEFAULT_EPOCH;
  try {
    const yaml = parseYaml(
      readFileSync(join(contentRoot, 'world/day-night.yaml'), 'utf8'),
    ) as DayNightYaml;
    cycleMinutes = yaml.cycleMinutes ?? DEFAULT_CYCLE_MINUTES;
    epochMs = parseEpoch(yaml.epoch);
  } catch {
    /* defaults */
  }
  return {
    cycleMs: Math.max(5, cycleMinutes) * 60_000,
    epochMs,
  };
}

/** Shared authoritative world clock for day/night. */
export class DayNightService {
  private readonly config: DayNightConfig;

  constructor(config = loadConfig()) {
    this.config = config;
  }

  configSnapshot(): DayNightConfig {
    return { ...this.config };
  }

  baseSnapshot(now = Date.now()): DayNightSnapshot {
    return computeBaseDayNightSnapshot(now, this.config, now);
  }

  snapshot(now = Date.now(), profile?: DayNightLocationProfile): DayNightSnapshot {
    return computeDayNightSnapshot(now, this.config, {
      profile: profile ?? { mode: 'outdoor', safeZone: false },
      serverAt: now,
    });
  }

  snapshotForLocation(locationId: string, now = Date.now()): DayNightSnapshot {
    const loc = getLocation(locationId);
    const profile = resolveDayNightProfile({
      id: loc?.id ?? locationId,
      dayNight: loc?.dayNight,
      safeZone: loc?.safeZone,
      anomalyTier: loc?.anomalyTier,
      privateOwnerOnly: loc?.privateOwnerOnly,
    });
    return this.snapshot(now, profile);
  }

  profileForLocation(locationId: string): DayNightLocationProfile {
    const loc = getLocation(locationId);
    return resolveDayNightProfile({
      id: loc?.id ?? locationId,
      dayNight: loc?.dayNight,
      safeZone: loc?.safeZone,
      anomalyTier: loc?.anomalyTier,
      privateOwnerOnly: loc?.privateOwnerOnly,
    });
  }
}
