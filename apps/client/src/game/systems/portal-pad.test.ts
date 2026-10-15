import { describe, expect, it } from 'vitest';
import { havenTravelPadAabb, HAVEN_TRAVEL_PAD_Y_OFFSET } from '@empery/shared';
import { playerInsideTravelPad, travelConfirmLabel } from './portal-pad.js';

describe('playerInsideTravelPad', () => {
  it('matches havenTravelPadAabb (apartment door 640,780 r=72)', () => {
    const zx = 640;
    const zy = 780;
    const r = 72;
    const box = havenTravelPadAabb(zx, zy, r);
    expect(playerInsideTravelPad(zx, zy + HAVEN_TRAVEL_PAD_Y_OFFSET, zx, zy, r)).toBe(true);
    expect(playerInsideTravelPad((box.L + box.R) / 2, (box.T + box.B) / 2, zx, zy, r)).toBe(true);
    expect(playerInsideTravelPad(box.L - 1, (box.T + box.B) / 2, zx, zy, r)).toBe(false);
    expect(playerInsideTravelPad(0, 0, zx, zy, r)).toBe(false);
  });
});

describe('travelConfirmLabel', () => {
  it('adds [R] once', () => {
    expect(travelConfirmLabel('↓ На улицу · Гавань')).toBe('↓ На улицу · Гавань [R]');
    expect(travelConfirmLabel('Гавань [R]')).toBe('Гавань [R]');
    expect(travelConfirmLabel('Гавань [E]')).toBe('Гавань [R]');
  });
});
