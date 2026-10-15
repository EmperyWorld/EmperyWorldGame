import { describe, expect, it } from 'vitest';
import { mountedYieldCandidates } from './citizen-mounted-yield.js';

describe('mountedYieldCandidates', () => {
  it('returns opposite points perpendicular to the player vector', () => {
    const [preferred, fallback] = mountedYieldCandidates(
      { x: 100, y: 200 },
      { x: 20, y: 0 },
      1,
      18,
    );

    expect(preferred).toEqual({ x: 100, y: 218 });
    expect(fallback).toEqual({ x: 100, y: 182 });
  });

  it('uses the stable lane to choose the preferred side', () => {
    const [leftLane] = mountedYieldCandidates(
      { x: 100, y: 200 },
      { x: 0, y: 20 },
      -1,
      18,
    );
    const [rightLane] = mountedYieldCandidates(
      { x: 100, y: 200 },
      { x: 0, y: 20 },
      1,
      18,
    );

    expect(leftLane).toEqual({ x: 118, y: 200 });
    expect(rightLane).toEqual({ x: 82, y: 200 });
  });

  it('returns finite horizontal candidates for coincident positions', () => {
    const candidates = mountedYieldCandidates(
      { x: 10, y: 20 },
      { x: 0, y: 0 },
      1,
    );

    expect(candidates).toEqual([
      { x: -8, y: 20 },
      { x: 28, y: 20 },
    ]);
  });
});
