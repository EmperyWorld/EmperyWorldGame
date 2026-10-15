import { describe, expect, it } from 'vitest';
import {
  cityGateOpenAssetId,
  cityGatePillarBoxes,
  isCityGateAsset,
} from './prop-colliders.js';
import { propColliderMode } from './prop-layer.js';

describe('city gate open/close colliders', () => {
  it('seals the door leaf when closed and opens a road slit when open', () => {
    const closed = cityGatePillarBoxes('prop_city_gate', 2592, 160, 240);
    const open = cityGatePillarBoxes('prop_city_gate_open', 2592, 160, 240);
    expect(closed.length).toBe(3);
    expect(open.length).toBe(2);
    const closedInner = closed.find((b) => Math.abs(b.cx - 2592) < 1)!;
    expect(closedInner.bw).toBeGreaterThan(20);
    const left = open.find((b) => b.cx < 2592)!;
    const right = open.find((b) => b.cx > 2592)!;
    expect(right.cx - right.bw / 2 - (left.cx + left.bw / 2)).toBeGreaterThan(60);
  });

  it('maps closed ids to open asset ids', () => {
    expect(cityGateOpenAssetId('prop_city_gate_e')).toBe('prop_city_gate_e_open');
    expect(isCityGateAsset('prop_harbor_guard_arch')).toBe(true);
  });

  it('treats open gates and harbor arch as walk-through arches', () => {
    expect(propColliderMode('prop_city_gate_open')).toBe('arch');
    expect(propColliderMode('prop_harbor_guard_arch')).toBe('arch');
    expect(propColliderMode('prop_city_gate')).toBe('behind');
  });
});
