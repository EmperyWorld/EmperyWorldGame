import { describe, expect, it } from 'vitest';
import { formatAdenaLabel, statLabel } from './stat-labels.js';

describe('stat-labels', () => {
  it('maps combat stats to short Russian labels', () => {
    expect(statLabel('pAtk')).toBe('Атк');
    expect(statLabel('mDef')).toBe('М.защ');
    expect(statLabel('unknown_stat')).toBe('unknown_stat');
  });

  it('formats adena with a Russian unit', () => {
    expect(formatAdenaLabel(0)).toBe('0 адены');
    expect(formatAdenaLabel(5)).toMatch(/5 адены$/);
  });
});
