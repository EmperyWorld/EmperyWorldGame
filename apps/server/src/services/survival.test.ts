import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import {
  WeatherService,
  applySurvivalCollapse,
  stabilizeSurvivalAfterRevive,
  consumeSurvivalItem,
  processSurvival,
  simulateSurvival,
  startSurvivalRest,
  applyRestRecovery,
  survivalOf,
  treatSurvival,
} from './survival.js';
import { treatAtNpc } from './medical.js';
import { restAtInn } from './town-services.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 'survival-test',
    name: 'Путник',
    race: 'human',
    profession: 'warrior',
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 20,
    location: 'starter_grove',
    adena: 0,
    inventory: [],
    equipment: {},
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Survival-Life Core', () => {
  it('normalizes legacy state through its first simulation', () => {
    const now = Date.now();
    const result = simulateSurvival(
      baseSave(),
      { weather: new WeatherService().snapshot(), safeZone: false },
      now,
    );
    expect(result.survival).toBeDefined();
    expect(survivalOf(result).satiety).toBe(100);
  });

  it('applies pressure after a long catch-up but offline never reaches critical injury', () => {
    const now = Date.now();
    const offline = simulateSurvival(
      baseSave({
        survival: {
          version: 1,
          satiety: 10,
          hydration: 10,
          bodyTemperature: 37,
          fatigue: 90,
          wetness: 70,
          conditions: [],
          events: [],
          lastSimulatedAt: new Date(now - 10 * 60 * 60_000).toISOString(),
          restingUntil: null,
        },
      }),
      {
        weather: { id: 'cold_snap', name: 'Холод', temperatureDelta: -12, humidity: 60, wetnessPerHour: 4 },
        activePlay: false,
      },
      now,
    );
    expect(offline.survival?.conditions.some((condition) => condition.severity === 'critical')).toBe(false);
    expect(offline.survival?.conditions.some((condition) => condition.kind === 'injury')).toBe(false);

    const live = simulateSurvival(
      baseSave({
        survival: {
          version: 1,
          satiety: 10,
          hydration: 10,
          bodyTemperature: 37,
          fatigue: 90,
          wetness: 70,
          conditions: [],
          events: [],
          lastSimulatedAt: new Date(now - 10 * 60 * 60_000).toISOString(),
          restingUntil: null,
        },
      }),
      {
        weather: { id: 'cold_snap', name: 'Холод', temperatureDelta: -12, humidity: 60, wetnessPerHour: 4 },
        activePlay: true,
      },
      now,
    );
    expect(live.survival?.conditions.some((condition) => condition.severity === 'critical')).toBe(true);
  });

  it('exposes seasonal forecast from weather service', () => {
    const weather = new WeatherService();
    const forecast = weather.forecast(Date.now(), 3);
    expect(forecast).toHaveLength(3);
    expect(forecast[0]?.weather.id).toBeTruthy();
    expect(forecast[0]?.season.id).toBeTruthy();
  });

  it('keeps inventory entries in sync when processing water', () => {
    const result = processSurvival(
      baseSave({ inventory: ['dirty_water', 'charcoal_filter'] }),
      'filter_water',
    );
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toEqual(['filtered_water']);
    expect(result.save.inventoryEntries?.some((e) => e.itemId === 'filtered_water')).toBe(true);
  });

  it('consumes risky water and records illness risk', () => {
    const result = consumeSurvivalItem(baseSave({ inventory: ['dirty_water'] }), 'dirty_water');
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toEqual([]);
    expect(result.save.survival?.hydration).toBeGreaterThan(0);
    expect(
      result.save.survival?.events.some((e) => e.type === 'warning' && e.message.includes('Риск')),
    ).toBe(true);
  });

  it('processes water only when tools are present', () => {
    const failed = processSurvival(baseSave({ inventory: ['dirty_water'] }), 'filter_water');
    expect(failed.ok).toBe(false);
    const result = processSurvival(
      baseSave({ inventory: ['dirty_water', 'charcoal_filter'] }),
      'filter_water',
    );
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toEqual(['filtered_water']);
  });

  it('turns a critical state into a recoverable survival collapse', () => {
    const save = baseSave({
      survival: {
        version: 1,
        satiety: 0,
        hydration: 80,
        bodyTemperature: 37,
        fatigue: 0,
        wetness: 0,
        conditions: [{ id: 'hungry', severity: 'critical', kind: 'deficit', startedAt: new Date().toISOString() }],
        events: [],
        lastSimulatedAt: new Date().toISOString(),
        restingUntil: null,
      },
    });
    const result = applySurvivalCollapse(save);
    expect(result.hp).toBe(0);
    expect(result.lastDeathCause).toContain('голод');
    expect(result.lastDeathKind).toBe('faint');
    expect(result.survival?.conditions.some((condition) => condition.id === 'exhaustion_injury')).toBe(true);
  });

  it('collapse from fatigue leaves an exhaustion injury', () => {
    const save = baseSave({
      survival: {
        version: 1,
        satiety: 70,
        hydration: 70,
        bodyTemperature: 37,
        fatigue: 96,
        wetness: 0,
        conditions: [{ id: 'fatigued', severity: 'critical', kind: 'deficit', startedAt: new Date().toISOString() }],
        events: [],
        lastSimulatedAt: new Date().toISOString(),
        restingUntil: null,
      },
    });
    const result = applySurvivalCollapse(save);
    expect(result.hp).toBe(0);
    expect(result.lastDeathCause).toContain('усталость');
    expect(result.survival?.conditions.some((c) => c.id === 'exhaustion_injury' && c.kind === 'injury')).toBe(
      true,
    );
    expect(result.lastDeathKind).toBe('faint');
  });

  it('second collapse with untreated injury is Гибель', () => {
    const startedAt = new Date().toISOString();
    const save = baseSave({
      survival: {
        version: 1,
        satiety: 0,
        hydration: 70,
        bodyTemperature: 37,
        fatigue: 20,
        wetness: 0,
        conditions: [
          { id: 'hungry', severity: 'critical', kind: 'deficit', startedAt },
          { id: 'exhaustion_injury', severity: 'deficit', kind: 'injury', startedAt },
        ],
        events: [],
        lastSimulatedAt: startedAt,
        restingUntil: null,
      },
    });
    const result = applySurvivalCollapse(save);
    expect(result.hp).toBe(0);
    expect(result.lastDeathKind).toBe('doom');
    expect(result.lastDeathCause).toContain('Гибель');
    expect(result.lastDeathCause).toContain('голод');
  });

  it('safe zone keeps a second collapse as faint, not Гибель', () => {
    const startedAt = new Date().toISOString();
    const result = applySurvivalCollapse(
      baseSave({
        location: 'empery_haven',
        survival: {
          version: 1,
          satiety: 0,
          hydration: 70,
          bodyTemperature: 37,
          fatigue: 20,
          wetness: 0,
          conditions: [
            { id: 'hungry', severity: 'critical', kind: 'deficit', startedAt },
            { id: 'exhaustion_injury', severity: 'deficit', kind: 'injury', startedAt },
          ],
          events: [],
          lastSimulatedAt: startedAt,
          restingUntil: null,
        },
      }),
    );
    expect(result.lastDeathKind).toBe('faint');
    expect(result.lastDeathCause).toContain('Потерял сознание');
  });

  it('revive grace blocks Гибель even in the field', () => {
    const startedAt = new Date().toISOString();
    const result = applySurvivalCollapse(
      baseSave({
        location: 'starter_grove',
        survival: {
          version: 1,
          satiety: 0,
          hydration: 70,
          bodyTemperature: 37,
          fatigue: 20,
          wetness: 0,
          conditions: [
            { id: 'hungry', severity: 'critical', kind: 'deficit', startedAt },
            { id: 'exhaustion_injury', severity: 'deficit', kind: 'injury', startedAt },
          ],
          events: [],
          lastSimulatedAt: startedAt,
          restingUntil: null,
          doomGraceUntil: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    );
    expect(result.lastDeathKind).toBe('faint');
  });

  it('stabilize after collapse removes the critical cliff so collapse does not repeat', () => {
    const collapsed = applySurvivalCollapse(
      baseSave({
        survival: {
          version: 1,
          satiety: 0,
          hydration: 0,
          bodyTemperature: 37,
          fatigue: 98,
          wetness: 0,
          conditions: [
            { id: 'hungry', severity: 'critical', kind: 'deficit', startedAt: new Date().toISOString() },
            { id: 'fatigued', severity: 'critical', kind: 'deficit', startedAt: new Date().toISOString() },
          ],
          events: [],
          lastSimulatedAt: new Date().toISOString(),
          restingUntil: null,
        },
      }),
    );
    const revived = {
      ...collapsed,
      hp: 50,
      survival: stabilizeSurvivalAfterRevive(collapsed.survival!),
    };
    expect(revived.survival.fatigue).toBeLessThan(65);
    expect(revived.survival.satiety).toBeGreaterThan(8);
    expect(applySurvivalCollapse(revived).hp).toBe(50);
  });

  it('uses equipment insulation and nearby heat to resist cold', () => {
    const now = Date.now();
    const initial = {
      version: 1 as const,
      satiety: 90,
      hydration: 90,
      bodyTemperature: 36,
      fatigue: 0,
      wetness: 60,
      conditions: [],
      events: [],
      lastSimulatedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
      restingUntil: null,
    };
    const bare = simulateSurvival(
      baseSave({ survival: initial }),
      { weather: { id: 'cold_snap', name: 'Холод', temperatureDelta: -12, humidity: 60, wetnessPerHour: 4 } },
      now,
    );
    const sheltered = simulateSurvival(
      baseSave({
        survival: initial,
        equipment: { body: 'leather_tunic', cloak: 'traveler_cloak' },
      }),
      {
        weather: { id: 'cold_snap', name: 'Холод', temperatureDelta: -12, humidity: 60, wetnessPerHour: 4 },
        nearHeatSource: true,
      },
      now,
    );
    expect(sheltered.survival!.bodyTemperature).toBeGreaterThan(bare.survival!.bodyTemperature);
  });

  it('rest is limited to a safe zone and treatment removes an injury', () => {
    expect(startSurvivalRest(baseSave()).ok).toBe(false);
    const hurt = baseSave({
      location: 'empery_haven',
      inventory: ['field_bandage'],
      survival: {
        version: 1,
        satiety: 80,
        hydration: 80,
        bodyTemperature: 37,
        fatigue: 20,
        wetness: 0,
        conditions: [
          { id: 'frostbite', severity: 'deficit', kind: 'injury', startedAt: new Date().toISOString() },
        ],
        events: [],
        lastSimulatedAt: new Date().toISOString(),
        restingUntil: null,
      },
    });
    expect(startSurvivalRest(hurt).ok).toBe(true);
    expect(treatSurvival(hurt, 'field_bandage').save.survival?.conditions).toHaveLength(0);
  });

  it('rest instantly lowers fatigue in a safe zone', () => {
    const now = Date.now();
    const tired = baseSave({
      location: 'empery_haven',
      survival: {
        version: 1,
        satiety: 80,
        hydration: 80,
        bodyTemperature: 37,
        fatigue: 85,
        wetness: 0,
        conditions: [{ id: 'fatigued', severity: 'deficit', kind: 'deficit', startedAt: new Date().toISOString() }],
        events: [],
        lastSimulatedAt: new Date(now).toISOString(),
        restingUntil: null,
      },
    });
    const result = applyRestRecovery(tired, now, { instantFatigueRelief: 25, restMinutes: 20 });
    expect(result.ok).toBe(true);
    expect(survivalOf(result.save!, now).fatigue).toBe(60);
    expect(result.save!.survival?.restingUntil).not.toBeNull();
  });

  it('inn rest works with full hp when fatigue is high', () => {
    const now = Date.now();
    const tired = baseSave({
      location: 'empery_haven',
      adena: 100,
      survival: {
        version: 1,
        satiety: 80,
        hydration: 80,
        bodyTemperature: 37,
        fatigue: 78,
        wetness: 0,
        conditions: [{ id: 'fatigued', severity: 'deficit', kind: 'deficit', startedAt: new Date(now).toISOString() }],
        events: [],
        lastSimulatedAt: new Date(now).toISOString(),
        restingUntil: null,
      },
    });
    const result = restAtInn(tired, now);
    expect(result.ok).toBe(true);
    expect(survivalOf(result.save, now).fatigue).toBe(33);
    expect(result.save.adena).toBe(75);
  });

  it('dries cooked meat at a heat station and assigns entry ids', () => {
    const result = processSurvival(
      baseSave({ inventory: ['cooked_meat', 'camp_fuel'] }),
      'dry_meat',
    );
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toEqual(['dried_meat']);
    expect(result.save.inventoryEntries?.[0]?.id).toBeTruthy();
  });

  it('rejects boil when no required stations are nearby', () => {
    const result = processSurvival(
      baseSave({
        location: 'starter_grove',
        inventory: ['filtered_water', 'field_pot', 'camp_fuel'],
      }),
      'boil_water',
      Date.now(),
      { nearStations: new Set() },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/станци/i);
  });

  it('cooks at a lit hearth without firestarter', () => {
    const result = processSurvival(
      baseSave({
        location: 'haven_apartment',
        inventory: ['raw_meat', 'camp_fuel'],
      }),
      'cook_meat',
      Date.now(),
      { nearStations: new Set(['hearth', 'campfire']) },
    );
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toEqual(['camp_fuel', 'cooked_meat']);
  });

  it('cooks apartment fridge meat at the pechka without camping kit', () => {
    const result = processSurvival(
      baseSave({
        location: 'haven_apartment',
        inventory: [],
        housing: {
          tier: 1,
          purchasedAt: new Date().toISOString(),
          storages: {
            materials: [],
            gear: [],
            food: [
              {
                id: 'm1',
                itemId: 'raw_meat',
                quantity: 2,
                acquiredAt: new Date().toISOString(),
              },
            ],
          },
        },
      }),
      'cook_meat',
      Date.now(),
      { nearStations: new Set(['hearth', 'campfire']) },
    );
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toEqual(['cooked_meat']);
    expect(result.save.housing?.storages.food).toHaveLength(1);
    expect(result.save.housing?.storages.food[0]?.quantity).toBe(1);
  });

  it('warms at hearth via light_fire without camping kit', () => {
    const result = processSurvival(
      baseSave({ location: 'haven_apartment', inventory: [] }),
      'light_fire',
      Date.now(),
      { nearStations: new Set(['hearth', 'campfire']) },
    );
    expect(result.ok).toBe(true);
  });

  it('stabilizes cold pressure near a campfire recipe', () => {
    const result = processSurvival(baseSave({ location: 'starter_grove', inventory: [] }), 'stabilize_camp');
    expect(result.ok).toBe(true);
    expect(result.save.survival?.bodyTemperature).toBeGreaterThan(36);
  });

  it('heals illness at the Haven NPC for a fee', () => {
    const hurt = baseSave({
      adena: 100,
      survival: {
        version: 1,
        satiety: 80,
        hydration: 80,
        bodyTemperature: 37,
        fatigue: 40,
        wetness: 0,
        conditions: [
          { id: 'infection', severity: 'deficit', kind: 'illness', startedAt: new Date().toISOString() },
        ],
        events: [],
        lastSimulatedAt: new Date().toISOString(),
        restingUntil: null,
      },
    });
    const result = treatAtNpc(hurt, 'town_healer', hurt.survival!);
    expect(result.ok).toBe(true);
    expect(result.save.adena).toBe(55);
    expect(result.save.survival?.conditions).toHaveLength(0);
  });
});

describe('Survival scenarios', () => {
  it('keeps offline catch-up non-lethal over a long gap', () => {
    const now = Date.now();
    const result = simulateSurvival(
      baseSave({
        survival: {
          version: 1,
          satiety: 40,
          hydration: 40,
          bodyTemperature: 36.5,
          fatigue: 20,
          wetness: 10,
          conditions: [],
          events: [],
          lastSimulatedAt: new Date(now - 24 * 60 * 60_000).toISOString(),
          restingUntil: null,
        },
      }),
      {
        weather: { id: 'rain', name: 'Дождь', temperatureDelta: -4, humidity: 90, wetnessPerHour: 20 },
        activePlay: false,
      },
      now,
    );
    expect(result.hp).toBeGreaterThan(0);
    expect(result.survival?.conditions.some((c) => c.severity === 'critical')).toBe(false);
    expect(result.survival?.conditions.some((c) => c.kind === 'injury')).toBe(false);
  });

  it('progresses illness from mild to acute after several hours online', () => {
    const now = Date.now();
    const started = new Date(now - 5 * 60 * 60_000).toISOString();
    const result = simulateSurvival(
      baseSave({
        survival: {
          version: 1,
          satiety: 80,
          hydration: 80,
          bodyTemperature: 37,
          fatigue: 10,
          wetness: 0,
          conditions: [{ id: 'infection', severity: 'deficit', kind: 'illness', stage: 'mild', startedAt: started }],
          events: [],
          lastSimulatedAt: new Date(now - 30 * 60_000).toISOString(),
          restingUntil: null,
        },
      }),
      {
        weather: { id: 'clear', name: 'Ясно', temperatureDelta: 0, humidity: 40, wetnessPerHour: -5 },
        activePlay: true,
      },
      now,
    );
    expect(result.survival?.conditions.find((c) => c.id === 'infection')?.stage).toBe('acute');
  });

  it('covers cold → heat stabilize → treat injury path', () => {
    const now = Date.now();
    const cold = simulateSurvival(
      baseSave({
        survival: {
          version: 1,
          satiety: 70,
          hydration: 70,
          bodyTemperature: 35.2,
          fatigue: 30,
          wetness: 80,
          conditions: [],
          events: [],
          lastSimulatedAt: new Date(now - 3 * 60 * 60_000).toISOString(),
          restingUntil: null,
        },
      }),
      {
        weather: { id: 'cold_snap', name: 'Холод', temperatureDelta: -12, humidity: 60, wetnessPerHour: 4 },
        activePlay: true,
      },
      now,
    );
    const warmed = processSurvival(cold, 'stabilize_camp', now);
    expect(warmed.ok).toBe(true);
    const injured = {
      ...warmed.save,
      location: 'empery_haven',
      inventory: ['field_bandage'],
      survival: {
        ...warmed.save.survival!,
        conditions: [
          ...(warmed.save.survival?.conditions ?? []),
          { id: 'frostbite' as const, severity: 'deficit' as const, kind: 'injury' as const, startedAt: new Date(now).toISOString() },
        ],
      },
    };
    const treated = treatSurvival(injured, 'field_bandage', now);
    expect(treated.save.survival?.conditions.some((c) => c.id === 'frostbite')).toBe(false);
  });
});
