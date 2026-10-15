/** Shared world day/night clock and render hints. */

export const DAY_NIGHT_PHASES = ['night', 'dawn', 'day', 'dusk'] as const;
export type DayNightPhaseId = (typeof DAY_NIGHT_PHASES)[number];

export const DAY_NIGHT_LOCATION_MODES = ['outdoor', 'indoor', 'dungeon'] as const;
export type DayNightLocationMode = (typeof DAY_NIGHT_LOCATION_MODES)[number];

export interface DayNightLocationProfile {
  mode: DayNightLocationMode;
  safeZone: boolean;
}

export interface DayNightSnapshot {
  phase: DayNightPhaseId;
  phaseName: string;
  /** In-game hour 0–24 (float). */
  hour: number;
  /** 0–1 position in the day cycle. */
  dayProgress: number;
  /** 0 = bright noon, 1 = deep night — for overlay strength. */
  darkness: number;
  /** ARGB tint for the fullscreen overlay. */
  overlayColor: number;
  /** 0–1 overlay alpha. */
  overlayAlpha: number;
  /** Real ms for one full in-game day. */
  cycleMs: number;
  /** Epoch ms (world clock origin). */
  epochMs: number;
  /** Server time when snapshot was taken. */
  serverAt: number;
}

export interface DayNightConfig {
  cycleMs: number;
  epochMs: number;
}

const PHASE_NAMES: Record<DayNightPhaseId, string> = {
  night: 'Ночь',
  dawn: 'Рассвет',
  day: 'День',
  dusk: 'Закат',
};

/** Darkness keyframes by in-game hour. Night must read as night, not dusk. */
const DARKNESS_KEYS: Array<[number, number]> = [
  [0, 0.9],
  [5, 0.78],
  [7, 0.12],
  [12, 0],
  [17, 0],
  [19, 0.22],
  [21, 0.72],
  [24, 0.9],
];

/** Overlay tint keyframes (hex) — deeper blues at night. */
const TINT_KEYS: Array<[number, number]> = [
  [0, 0x060a1c],
  [5, 0x121830],
  [7, 0xffc080],
  [12, 0xffffff],
  [17, 0xffffff],
  [19, 0xff8040],
  [21, 0x0a1028],
  [24, 0x060a1c],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

function interpolateKeys(hour: number, keys: Array<[number, number]>, color = false): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < keys.length - 1; i++) {
    const [h0, v0] = keys[i]!;
    const [h1, v1] = keys[i + 1]!;
    if (h >= h0 && h <= h1) {
      const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
      return color ? lerpColor(v0, v1, t) : lerp(v0, v1, t);
    }
  }
  return keys[keys.length - 1]![1];
}

export function gameHourFromMs(now: number, cycleMs: number, epochMs: number): number {
  const cycle = Math.max(60_000, cycleMs);
  const elapsed = Math.max(0, now - epochMs);
  const progress = (elapsed % cycle) / cycle;
  return progress * 24;
}

/** Unwrapped in-game hours since the world epoch (not modulo 24). */
export function absoluteGameHours(now: number, cycleMs: number, epochMs: number): number {
  const cycle = Math.max(60_000, cycleMs);
  return Math.max(0, now - epochMs) / cycle * 24;
}

export function resolveDayNightPhase(hour: number): DayNightPhaseId {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h < 19) return 'day';
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 19 && h < 21) return 'dusk';
  return 'night';
}

/** Default lighting profile from location YAML fields. */
export function resolveDayNightProfile(loc: {
  id?: string;
  dayNight?: DayNightLocationMode;
  safeZone?: boolean;
  anomalyTier?: number;
  privateOwnerOnly?: boolean;
}): DayNightLocationProfile {
  if (loc.dayNight) {
    return { mode: loc.dayNight, safeZone: Boolean(loc.safeZone) };
  }
  if (loc.privateOwnerOnly || loc.id === 'haven_apartment') {
    return { mode: 'indoor', safeZone: true };
  }
  if (loc.safeZone) return { mode: 'outdoor', safeZone: true };
  if ((loc.anomalyTier ?? 1) >= 2) return { mode: 'dungeon', safeZone: false };
  return { mode: 'outdoor', safeZone: false };
}

export function computeBaseDayNightSnapshot(
  now: number,
  config: DayNightConfig,
  serverAt = now,
): DayNightSnapshot {
  const hour = gameHourFromMs(now, config.cycleMs, config.epochMs);
  const phase = resolveDayNightPhase(hour);
  const darkness = interpolateKeys(hour, DARKNESS_KEYS);
  const tint = interpolateKeys(hour, TINT_KEYS, true);
  const overlayAlpha = Math.min(0.82, darkness * 0.95);
  return {
    phase,
    phaseName: PHASE_NAMES[phase],
    hour,
    dayProgress: hour / 24,
    darkness,
    overlayColor: tint,
    overlayAlpha,
    cycleMs: config.cycleMs,
    epochMs: config.epochMs,
    serverAt,
  };
}

export function applyDayNightLocationMode(
  base: DayNightSnapshot,
  profile: DayNightLocationProfile,
): DayNightSnapshot {
  if (profile.mode === 'dungeon') {
    return {
      ...base,
      phase: 'night',
      phaseName: PHASE_NAMES.night,
      darkness: 0.84,
      overlayColor: 0x060812,
      overlayAlpha: 0.7,
    };
  }
  if (profile.mode === 'indoor') {
    const darkness = Math.min(0.28, base.darkness * 0.22);
    return {
      ...base,
      darkness,
      overlayColor: 0x2a2018,
      overlayAlpha: Math.min(0.32, darkness * 0.85),
    };
  }
  // Safe towns stay readable, but night must still clearly darken (not "day with lamps").
  let darkness = base.darkness;
  if (profile.safeZone) darkness *= 0.92;
  const tint = interpolateKeys(base.hour, TINT_KEYS, true);
  let overlayAlpha = Math.min(0.82, darkness * 0.95);
  if (darkness >= 0.4) overlayAlpha = Math.max(overlayAlpha, profile.safeZone ? 0.55 : 0.62);
  return {
    ...base,
    darkness,
    overlayColor: tint,
    overlayAlpha,
  };
}

export function computeDayNightSnapshot(
  now: number,
  config: DayNightConfig,
  opts?: { profile?: DayNightLocationProfile; serverAt?: number },
): DayNightSnapshot {
  const base = computeBaseDayNightSnapshot(now, config, opts?.serverAt ?? now);
  return applyDayNightLocationMode(
    base,
    opts?.profile ?? { mode: 'outdoor', safeZone: false },
  );
}

/** Extrapolate snapshot on the client between server syncs. */
export function dayNightAt(
  now: number,
  base: Pick<DayNightSnapshot, 'cycleMs' | 'epochMs'>,
  profile?: DayNightLocationProfile,
): DayNightSnapshot {
  return computeDayNightSnapshot(now, base, {
    profile: profile ?? { mode: 'outdoor', safeZone: false },
    serverAt: now,
  });
}

export function formatGameClock(hour: number): string {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
