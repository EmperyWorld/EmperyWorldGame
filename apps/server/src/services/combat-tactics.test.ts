import { describe, expect, it } from 'vitest';
import {
  attackArc,
  applyMobControl,
  closeRangeMods,
  comboDamageMultiplier,
  evaluateTacticGate,
  EXECUTE_HP_RATIO,
  expireMobControl,
  peekCombo,
  PIN_SPEED_MULT,
  poisonDot,
  pushCombo,
  rangedDistanceMods,
  resolveSkillControl,
  snipeDistanceMods,
  tacticStrikeBonuses,
} from '@empery/shared';

describe('attackArc', () => {
  it('front is where the target looks, back is behind', () => {
    expect(attackArc(120, 100, 100, 100, 'right')).toBe('front');
    expect(attackArc(80, 100, 100, 100, 'right')).toBe('back');
    expect(attackArc(80, 100, 100, 100, 'left')).toBe('front');
  });

  it('vertical offset vs side-facing is flank', () => {
    expect(attackArc(100, 40, 100, 100, 'right')).toBe('flank');
  });
});

describe('evaluateTacticGate', () => {
  it('rejects backstab from the front and execute above HP gate', () => {
    expect(evaluateTacticGate({ tactic: 'backstab', arc: 'front', hpRatio: 1 })).toEqual({
      ok: false,
      fail: 'backstab',
    });
    expect(evaluateTacticGate({ tactic: 'backstab', arc: 'back', hpRatio: 1 }).ok).toBe(true);
    expect(evaluateTacticGate({ tactic: 'backstab', arc: undefined, hpRatio: 1 }).ok).toBe(true);
    expect(
      evaluateTacticGate({ tactic: 'execute', arc: 'front', hpRatio: EXECUTE_HP_RATIO + 0.01 }),
    ).toEqual({ ok: false, fail: 'execute' });
    expect(evaluateTacticGate({ tactic: 'execute', arc: 'front', hpRatio: 0.2 }).ok).toBe(true);
    expect(evaluateTacticGate({ tactic: 'vanish', arc: 'front', hpRatio: 1 })).toEqual({
      ok: false,
      fail: 'vanish',
    });
    expect(evaluateTacticGate({ tactic: 'vanish', arc: 'front', hpRatio: 1, dashing: true }).ok).toBe(
      true,
    );
  });
});

describe('tacticStrikeBonuses', () => {
  it('buffs rear melee and marks backstab', () => {
    const rear = tacticStrikeBonuses({ tactic: 'backstab', arc: 'back', positional: true });
    const front = tacticStrikeBonuses({ tactic: undefined, arc: 'front', positional: true });
    expect(rear.backstab).toBe(true);
    expect(rear.damageMult).toBeGreaterThan(front.damageMult);
    expect(rear.critBonus).toBeGreaterThan(0);
  });

  it('execute guarantees a crit', () => {
    const exec = tacticStrikeBonuses({ tactic: 'execute', arc: 'front', positional: false });
    expect(exec.execute).toBe(true);
    expect(exec.guaranteedCrit).toBe(true);
    expect(exec.damageMult).toBeGreaterThan(1);
  });
});

describe('combo', () => {
  it('grows in the window and resets after a miss or timeout', () => {
    const t0 = 1_000;
    const one = pushCombo(undefined, t0, true);
    expect(one.count).toBe(1);
    const two = pushCombo(one, t0 + 400, true);
    expect(two.count).toBe(2);
    expect(comboDamageMultiplier(2)).toBeGreaterThan(1);
    const miss = pushCombo(two, t0 + 500, false);
    expect(miss.count).toBe(0);
    expect(peekCombo(two, t0 + 5_000)).toBe(0);
  });
});

describe('ranged tactics', () => {
  it('hip-fire is weaker than long shots', () => {
    const close = rangedDistanceMods(40);
    const far = rangedDistanceMods(200);
    expect(far.damageMult).toBeGreaterThan(close.damageMult);
    expect(far.accuracy).toBeGreaterThan(close.accuracy);
  });

  it('snipe sweet spot beats point-blank', () => {
    const hip = snipeDistanceMods(40);
    const sweet = snipeDistanceMods(220);
    expect(hip.snipe).toBe(false);
    expect(sweet.snipe).toBe(true);
    expect(sweet.damageMult).toBeGreaterThan(hip.damageMult);
  });

  it('poison ticks scale with rank and double on crit', () => {
    const r1 = poisonDot(100, 1, false);
    const r3 = poisonDot(100, 3, false);
    const crit = poisonDot(100, 1, true);
    expect(r3.tickDamage).toBeGreaterThan(r1.tickDamage);
    expect(crit.tickDamage).toBe(r1.tickDamage * 2);
    expect(r1.kind).toBe('poison');
  });

  it('mark bonus stacks on a strike', () => {
    const plain = tacticStrikeBonuses({ tactic: undefined, arc: 'front', positional: false });
    const marked = tacticStrikeBonuses({
      tactic: undefined,
      arc: 'front',
      positional: false,
      marked: true,
    });
    expect(marked.marked).toBe(true);
    expect(marked.damageMult).toBeGreaterThan(plain.damageMult);
    expect(marked.accuracy).toBeGreaterThan(plain.accuracy);
  });

  it('vanish and seek mark the strike', () => {
    const vanish = tacticStrikeBonuses({ tactic: 'vanish', arc: 'front', positional: true });
    const seek = tacticStrikeBonuses({ tactic: 'seek', arc: 'front', positional: false });
    expect(vanish.vanish).toBe(true);
    expect(vanish.damageMult).toBeGreaterThan(1);
    expect(seek.seek).toBe(true);
    expect(seek.accuracy).toBeGreaterThan(0);
  });
});

describe('mob control', () => {
  it('pin slows and stun stops, then expire restores speed', () => {
    const mob = { speed: 100 };
    applyMobControl(mob, 'pin', 1_000);
    expect(mob.speed).toBe(100 * PIN_SPEED_MULT);
    expect(mob.control?.kind).toBe('pin');
    applyMobControl(mob, 'stun', 1_100);
    expect(mob.speed).toBe(0);
    expect(mob.control?.restoreSpeed).toBe(100);
    expireMobControl(mob, 1_100);
    expect(mob.speed).toBe(0);
    expireMobControl(mob, 10_000);
    expect(mob.speed).toBe(100);
    expect(mob.control).toBeUndefined();
  });

  it('stun without a shield does not apply', () => {
    expect(resolveSkillControl({ control: 'stun', hasShield: false })).toBeUndefined();
    expect(resolveSkillControl({ control: 'stun', hasShield: true })).toBe('stun');
    expect(resolveSkillControl({ control: 'pin', hasShield: false })).toBe('pin');
  });
});

describe('close range bias', () => {
  it('pyre is stronger in melee than at range', () => {
    const close = closeRangeMods(40);
    const far = closeRangeMods(180);
    expect(close.pyre).toBe(true);
    expect(far.pyre).toBe(false);
    expect(close.damageMult).toBeGreaterThan(far.damageMult);
    expect(close.accuracy).toBeGreaterThan(far.accuracy);
    const stacked = tacticStrikeBonuses({
      tactic: 'cleave',
      arc: 'front',
      positional: false,
      distance: 40,
      rangeBias: 'close',
    });
    expect(stacked.pyre).toBe(true);
    expect(stacked.damageMult).toBeGreaterThan(1);
  });
});
