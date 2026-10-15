import { describe, expect, it } from 'vitest';
import {
  AMBIENT_SLEEP_BY_INDEX,
  resolveAmbientSleepTile,
} from '@empery/shared';

describe('AMBIENT_SLEEP_BY_INDEX', () => {
  it('has a unique door for every day ambient index slot', () => {
    expect(AMBIENT_SLEEP_BY_INDEX.length).toBeGreaterThanOrEqual(122);
    const keys = AMBIENT_SLEEP_BY_INDEX.map(([tx, ty]) => `${tx},${ty}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolveAmbientSleepTile returns unique doors by index when no explicit tile', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 122; i++) {
      const [tx, ty] = resolveAmbientSleepTile(40, 20, i);
      const k = `${tx},${ty}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('honors explicit sleepTile over the index table', () => {
    expect(resolveAmbientSleepTile(0, 0, 0, [59, 32])).toEqual([59, 32]);
  });
});
