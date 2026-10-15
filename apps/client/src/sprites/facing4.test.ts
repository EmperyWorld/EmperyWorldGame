import { describe, expect, it } from 'vitest';
import { facingFromDelta, facingNeedsFlipX, facingRow } from './facing4.js';

describe('facingFromDelta', () => {
  it('returns null when nearly still', () => {
    expect(facingFromDelta(0.1, 0.1)).toBeNull();
  });

  it('picks cardinals', () => {
    expect(facingFromDelta(0, -5)).toBe('up');
    expect(facingFromDelta(0, 5)).toBe('down');
    expect(facingFromDelta(-5, 0)).toBe('left');
    expect(facingFromDelta(5, 0)).toBe('right');
  });

  it('picks 45° diagonals', () => {
    expect(facingFromDelta(5, 5)).toBe('down-right');
    expect(facingFromDelta(-5, 5)).toBe('down-left');
    expect(facingFromDelta(5, -5)).toBe('up-right');
    expect(facingFromDelta(-5, -5)).toBe('up-left');
  });
});

describe('facingRow / flip', () => {
  it('maps side and diagonals to rows with flip on left*', () => {
    expect(facingRow('left')).toBe('side');
    expect(facingRow('right')).toBe('side');
    expect(facingRow('down-right')).toBe('down-side');
    expect(facingRow('up-left')).toBe('up-side');
    expect(facingNeedsFlipX('left')).toBe(true);
    expect(facingNeedsFlipX('down-left')).toBe(true);
    expect(facingNeedsFlipX('up-right')).toBe(false);
  });
});
