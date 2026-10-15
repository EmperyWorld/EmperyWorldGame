import { describe, expect, it } from 'vitest';
import {
  frameRateIndependentLerpFactor,
  REFERENCE_FRAME_MS,
} from './frame-interpolation.js';

function approachForFrames(factor: number, deltaMs: number, frames: number): number {
  let value = 0;
  for (let i = 0; i < frames; i++) {
    const adjusted = frameRateIndependentLerpFactor(factor, deltaMs);
    value += (1 - value) * adjusted;
  }
  return value;
}

describe('frameRateIndependentLerpFactor', () => {
  it('preserves the reference factor at 60 FPS', () => {
    expect(frameRateIndependentLerpFactor(0.24, REFERENCE_FRAME_MS)).toBeCloseTo(0.24, 10);
  });

  it('produces equivalent smoothing over equal time at 30, 60, and 120 FPS', () => {
    const at30 = approachForFrames(0.24, 1000 / 30, 30);
    const at60 = approachForFrames(0.24, 1000 / 60, 60);
    const at120 = approachForFrames(0.24, 1000 / 120, 120);

    expect(at30).toBeCloseTo(at60, 10);
    expect(at120).toBeCloseTo(at60, 10);
  });

  it('clamps factors and handles an invalid delta safely', () => {
    expect(frameRateIndependentLerpFactor(-1, 16)).toBe(0);
    expect(frameRateIndependentLerpFactor(2, 16)).toBe(1);
    expect(frameRateIndependentLerpFactor(0.24, Number.NaN)).toBeCloseTo(0.24, 10);
  });
});
