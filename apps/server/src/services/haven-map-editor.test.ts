import { describe, expect, it } from 'vitest';
import { validateHavenPropPlacements } from './haven-map-editor.js';

describe('validateHavenPropPlacements', () => {
  it('normalizes valid editor rows', () => {
    expect(
      validateHavenPropPlacements([
        ['prop_market_stall', 100.4, 200.6, 95.8, 6.2],
      ]),
    ).toEqual([['prop_market_stall', 100, 201, 96, 6]]);
  });

  it('rejects paths, out-of-bounds coordinates, and invalid sizes', () => {
    expect(() =>
      validateHavenPropPlacements([['../secret', 100, 200, 96, 6]]),
    ).toThrow('invalid prop placement');
    expect(() =>
      validateHavenPropPlacements([['prop_tree_oak', 9_000, 200, 96, 6]]),
    ).toThrow('outside Haven bounds');
    expect(() =>
      validateHavenPropPlacements([['prop_tree_oak', 100, 200, 4, 6]]),
    ).toThrow('invalid size or depth');
  });
});
