import { describe, expect, it } from 'vitest';
import { CombatAttackFsm } from './CombatAttackFsm.js';

describe('CombatAttackFsm', () => {
  it('runs idle → windup → resolve → recovery → idle', () => {
    const fsm = new CombatAttackFsm();
    expect(fsm.tryBegin()).toBe(true);
    expect(fsm.phase).toBe('windup');
    expect(fsm.tryEnter('resolve')).toBe(true);
    expect(fsm.tryEnter('recovery')).toBe(true);
    expect(fsm.tryEnter('idle')).toBe(true);
    expect(fsm.isBusy).toBe(false);
  });

  it('rejects illegal transitions', () => {
    const fsm = new CombatAttackFsm();
    expect(fsm.tryEnter('resolve')).toBe(false);
    fsm.tryBegin();
    expect(fsm.tryEnter('idle')).toBe(true);
  });

  it('reset clears in-flight attack', () => {
    const fsm = new CombatAttackFsm();
    fsm.tryBegin();
    fsm.reset();
    expect(fsm.phase).toBe('idle');
    expect(fsm.isBusy).toBe(false);
  });

  it('complete walks resolve → recovery → idle', () => {
    const fsm = new CombatAttackFsm();
    fsm.tryBegin();
    fsm.tryEnter('resolve');
    fsm.complete();
    expect(fsm.phase).toBe('idle');
  });
});
