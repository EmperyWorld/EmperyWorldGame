import { describe, expect, it } from 'vitest';
import {
  PLAYER_STAMINA_MAX,
  PLAYER_STAMINA_WALK_CAP,
  advancePlayerStamina,
  footMoveSpeed,
  playerCanDash,
  playerCanRun,
} from '@empery/shared';

describe('player stamina', () => {
  it('keeps heavy-load walking slower than full stamina running', () => {
    const exhausted = footMoveSpeed(200, 50, 200, 'human');
    const fresh = footMoveSpeed(200, 1000, 200, 'human');
    expect(exhausted).toBeLessThan(fresh);
    expect(exhausted).toBeLessThan(footMoveSpeed(200, 50, 80, 'human'));
  });
  it('walk band cannot run; dash needs minimum', () => {
    expect(playerCanRun(PLAYER_STAMINA_WALK_CAP)).toBe(false);
    expect(playerCanRun(PLAYER_STAMINA_WALK_CAP + 1)).toBe(true);
    expect(playerCanDash(20)).toBe(false);
    expect(playerCanDash(25)).toBe(true);
  });

  it('drains while running on foot and regens when mounted', () => {
    const drained = advancePlayerStamina({
      stamina: 800,
      dtSec: 2,
      onFoot: true,
      moving: true,
      running: true,
      carryWeightKg: 80,
      race: 'human',
    });
    expect(drained).toBeLessThan(800);

    const rested = advancePlayerStamina({
      stamina: 100,
      dtSec: 2,
      onFoot: false,
      moving: false,
      running: false,
      carryWeightKg: 80,
      race: 'human',
    });
    expect(rested).toBeGreaterThan(100);
  });

  it('dash pulse spends stamina', () => {
    const next = advancePlayerStamina({
      stamina: 500,
      dtSec: 0,
      onFoot: true,
      moving: true,
      running: true,
      carryWeightKg: 80,
      race: 'human',
      dashPulse: true,
    });
    expect(next).toBeLessThan(500);
  });

  it('run speed scales with stamina; heavy load slows', () => {
    const base = 100;
    const walk = footMoveSpeed(base, 50, 80, 'human');
    const full = footMoveSpeed(base, PLAYER_STAMINA_MAX, 80, 'human');
    const heavy = footMoveSpeed(base, PLAYER_STAMINA_MAX, 200, 'human');
    expect(walk).toBeCloseTo(base * 0.58, 5);
    expect(full).toBeGreaterThan(walk);
    expect(heavy).toBeLessThan(full);
  });
});
