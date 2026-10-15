import { describe, expect, it } from 'vitest';
import {
  applyDayNightLocationMode,
  computeBaseDayNightSnapshot,
  computeDayNightSnapshot,
  formatGameClock,
  gameHourFromMs,
  resolveDayNightPhase,
  resolveDayNightProfile,
} from '@empery/shared';

const CONFIG = { cycleMs: 40 * 60_000, epochMs: Date.UTC(2026, 0, 1) };

describe('day-night', () => {
  it('cycles 24 game hours over cycleMs', () => {
    const h0 = gameHourFromMs(CONFIG.epochMs, CONFIG.cycleMs, CONFIG.epochMs);
    const hHalf = gameHourFromMs(CONFIG.epochMs + CONFIG.cycleMs / 2, CONFIG.cycleMs, CONFIG.epochMs);
    expect(h0).toBeCloseTo(0, 5);
    expect(hHalf).toBeCloseTo(12, 1);
  });

  it('resolves phases by hour', () => {
    expect(resolveDayNightPhase(12)).toBe('day');
    expect(resolveDayNightPhase(6)).toBe('dawn');
    expect(resolveDayNightPhase(20)).toBe('dusk');
    expect(resolveDayNightPhase(2)).toBe('night');
  });

  it('is brighter at noon than midnight', () => {
    const noon = computeBaseDayNightSnapshot(
      CONFIG.epochMs + (12 / 24) * CONFIG.cycleMs,
      CONFIG,
    );
    const midnight = computeBaseDayNightSnapshot(CONFIG.epochMs, CONFIG);
    expect(noon.darkness).toBeLessThan(midnight.darkness);
    expect(noon.overlayAlpha).toBeLessThan(midnight.overlayAlpha);
  });

  it('dims less in safe outdoor zones', () => {
    const night = computeDayNightSnapshot(CONFIG.epochMs, CONFIG, {
      profile: { mode: 'outdoor', safeZone: false },
    });
    const safe = computeDayNightSnapshot(CONFIG.epochMs, CONFIG, {
      profile: { mode: 'outdoor', safeZone: true },
    });
    expect(safe.darkness).toBeLessThan(night.darkness);
    // Safe Haven still reads as night (not “day with lamps”).
    expect(safe.darkness).toBeGreaterThan(0.7);
    expect(safe.overlayAlpha).toBeGreaterThanOrEqual(0.55);
  });

  it('keeps dungeons dark all day', () => {
    const noon = computeDayNightSnapshot(
      CONFIG.epochMs + (12 / 24) * CONFIG.cycleMs,
      CONFIG,
      { profile: { mode: 'dungeon', safeZone: false } },
    );
    expect(noon.phase).toBe('night');
    expect(noon.darkness).toBeGreaterThan(0.7);
  });

  it('resolves location profiles from YAML hints', () => {
    expect(resolveDayNightProfile({ id: 'haven_apartment', privateOwnerOnly: true }).mode).toBe(
      'indoor',
    );
    expect(resolveDayNightProfile({ anomalyTier: 3, safeZone: false }).mode).toBe('dungeon');
    expect(resolveDayNightProfile({ safeZone: true }).mode).toBe('outdoor');
    expect(resolveDayNightProfile({ dayNight: 'outdoor', anomalyTier: 4 }).mode).toBe('outdoor');
  });

  it('formats clock', () => {
    expect(formatGameClock(14.5)).toBe('14:30');
  });

  it('applyDayNightLocationMode is idempotent for dungeon', () => {
    const base = computeBaseDayNightSnapshot(CONFIG.epochMs, CONFIG);
    const once = applyDayNightLocationMode(base, { mode: 'dungeon', safeZone: false });
    const twice = applyDayNightLocationMode(once, { mode: 'dungeon', safeZone: false });
    expect(twice.darkness).toBe(once.darkness);
  });
});
