import { describe, expect, it } from 'vitest';
import { questFlagsChanged } from './save-utils.js';

describe('questFlagsChanged', () => {
  it('detects added keys', () => {
    expect(questFlagsChanged({}, { q1: true })).toBe(true);
  });

  it('detects changed values without JSON.stringify', () => {
    expect(questFlagsChanged({ q1: false }, { q1: true })).toBe(true);
  });

  it('returns false when flags are equal', () => {
    expect(questFlagsChanged({ q1: true, q2: false }, { q2: false, q1: true })).toBe(false);
  });
});
