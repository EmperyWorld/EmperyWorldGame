import { describe, expect, it } from 'vitest';
import {
  MOUNT_STAMINA_MAX,
  MOUNT_STAMINA_WALK_CAP,
  MOUNT_CHARGE_MIN_STAMINA,
  advanceMountStamina,
  computeCarryWeightKg,
  mountCanCharge,
  mountCanRun,
  mountedMoveSpeed,
  raceBodyWeightKg,
} from '@empery/shared';

const horse = {
  speedMult: 1.5,
  staminaDrainMult: 1,
  staminaRegenMult: 1,
  carryComfortKg: 90,
  carryMaxKg: 140,
};

describe('carry weight', () => {
  it('sums body + gear + bag', () => {
    const items: Record<string, { id: string; slot: string; weight?: number; armorType?: 'heavy' }> = {
      iron_plate: { id: 'iron_plate', slot: 'body', armorType: 'heavy' },
      herb: { id: 'herb', slot: 'consumable', weight: 0.2 },
    };
    const w = computeCarryWeightKg({
      race: 'human',
      equipment: { body: 'iron_plate', weapon: null, head: null, legs: null, gloves: null, boots: null, cloak: null, shield: null, necklace: null, earring: null, ring: null, quiver: null, weapon2: null },
      inventory: ['herb', 'herb'],
      getItem: (id) => items[id],
    });
    expect(w.bodyKg).toBe(raceBodyWeightKg('human'));
    expect(w.gearKg).toBeGreaterThan(10);
    expect(w.bagKg).toBeCloseTo(0.4, 5);
    expect(w.totalKg).toBeCloseTo(w.bodyKg + w.gearKg + w.bagKg, 5);
  });

  it('elves are lighter than orcs', () => {
    expect(raceBodyWeightKg('elf')).toBeLessThan(raceBodyWeightKg('human'));
    expect(raceBodyWeightKg('orc')).toBeGreaterThan(raceBodyWeightKg('human'));
  });
});

describe('mount stamina', () => {
  it('walk band cannot run', () => {
    expect(mountCanRun(MOUNT_STAMINA_WALK_CAP)).toBe(false);
    expect(mountCanRun(MOUNT_STAMINA_WALK_CAP + 1)).toBe(true);
  });

  it('drains while mounted running and regens while walking', () => {
    const drained = advanceMountStamina({
      stamina: 800,
      dtSec: 2,
      mounted: true,
      moving: true,
      running: true,
      horse,
      carryWeightKg: 80,
    });
    expect(drained).toBeLessThan(800);

    const walked = advanceMountStamina({
      stamina: 50,
      dtSec: 2,
      mounted: true,
      moving: true,
      running: false,
      horse,
      carryWeightKg: 80,
    });
    expect(walked).toBeGreaterThan(50);

    const stabled = advanceMountStamina({
      stamina: 100,
      dtSec: 2,
      mounted: false,
      moving: false,
      running: false,
      horse,
      carryWeightKg: 80,
    });
    expect(stabled).toBeGreaterThan(walked);
  });

  it('charge pulse spends stamina', () => {
    const next = advanceMountStamina({
      stamina: 500,
      dtSec: 0,
      mounted: true,
      moving: true,
      running: true,
      horse,
      carryWeightKg: 80,
      chargePulse: true,
    });
    expect(next).toBeLessThan(500);
  });

  it('run speed scales with stamina above walk cap', () => {
    const foot = 100;
    const walk = mountedMoveSpeed(foot, 50, horse, 80);
    const mid = mountedMoveSpeed(foot, 550, horse, 80);
    const full = mountedMoveSpeed(foot, MOUNT_STAMINA_MAX, horse, 80);
    expect(walk).toBeCloseTo(foot * horse.speedMult * 0.55, 5);
    expect(mid).toBeGreaterThan(walk);
    expect(full).toBeGreaterThan(mid);
    expect(full).toBeCloseTo(foot * horse.speedMult, 5);
    // Tired vs fresh must be clearly different (not a ~10% nudge).
    expect(full / walk).toBeGreaterThan(1.7);
  });

  it('charge requires minimum stamina', () => {
    expect(mountCanCharge(0)).toBe(false);
    expect(mountCanCharge(MOUNT_CHARGE_MIN_STAMINA - 1)).toBe(false);
    expect(mountCanCharge(MOUNT_CHARGE_MIN_STAMINA)).toBe(true);
    expect(mountCanCharge(MOUNT_STAMINA_WALK_CAP)).toBe(true);
  });

  it('heavy load slows the horse', () => {
    const light = mountedMoveSpeed(100, MOUNT_STAMINA_MAX, horse, 80);
    const heavy = mountedMoveSpeed(100, MOUNT_STAMINA_MAX, horse, 140);
    expect(heavy).toBeLessThan(light);
  });
});
