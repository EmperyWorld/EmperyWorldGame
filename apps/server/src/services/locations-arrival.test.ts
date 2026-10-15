import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { arrivalSpawnForTravel, authorizeJoinLocation, canTravel, getLocation } from './locations.js';

function joinSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 'join-save',
    name: 'Tester',
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    maxMp: 0,
    mp: 0,
    location: 'empery_haven',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('arrivalSpawnForTravel', () => {
  it('spawns near the reverse portal when locations are linked', () => {
    const park = getLocation('suburban_park')!;
    const yard = getLocation('abandoned_yard')!;

    // Yard → Park: arrive at park's east portal (travelTo abandoned_yard)
    const toPark = arrivalSpawnForTravel('abandoned_yard', park);
    const parkEast = park.zones!.find((z) => z.travelTo === 'abandoned_yard')!;
    expect(Math.hypot(toPark.x - parkEast.x, toPark.y - parkEast.y)).toBeLessThan(280);
    expect(Math.hypot(toPark.x - park.spawn.x, toPark.y - park.spawn.y)).toBeGreaterThan(400);

    // Park → Yard: arrive at yard's west portal (travelTo suburban_park)
    const toYard = arrivalSpawnForTravel('suburban_park', yard);
    const yardWest = yard.zones!.find((z) => z.travelTo === 'suburban_park')!;
    expect(Math.hypot(toYard.x - yardWest.x, toYard.y - yardWest.y)).toBeLessThan(280);
    expect(toYard.x).toBeGreaterThan(yardWest.x);
  });

  it('uses the authored apartment arrival instead of projecting into its furnishings', () => {
    const apartment=getLocation('haven_apartment')!;
    expect(arrivalSpawnForTravel('empery_haven',apartment)).toEqual(apartment.spawn);
  });
  it('retains a coincident authored spawn without assuming a fixed map center', () => {
    const dest={...getLocation('suburban_park')!,spawn:{x:128,y:128},zones:[{x:128,y:128,label:'Exit',travelTo:'test'}]};
    expect(arrivalSpawnForTravel('test',dest)).toEqual({x:128,y:128});
  });
  it('falls back to default spawn when there is no reverse portal', () => {
    const haven = getLocation('empery_haven')!;
    const arrival = arrivalSpawnForTravel('silverwood', haven);
    expect(arrival).toEqual(haven.spawn);
  });

  it('exits the apartment on the street south of the tenement door', () => {
    const haven = getLocation('empery_haven')!;
    const door = haven.zones!.find((z) => z.travelTo === 'haven_apartment')!;
    expect(door).toBeTruthy();
    expect(door.x).toBe(1056);
    expect(door.y).toBe(2912);
    expect(door.radius).toBe(72);
    const arrival = arrivalSpawnForTravel('haven_apartment', haven);
    expect(arrival).toEqual({ x: 1120, y: 2976 });
    expect(arrival.y).toBeGreaterThan(door.y);
    expect(arrival).not.toEqual(haven.spawn);
  });

  it('links the actual indoor reception to the campus with safe arrivals and the same access requirement', () => {
    const campus=getLocation('empery_hq')!, lobby=getLocation('empery_hq_lobby')!;
    expect(lobby.dayNight).toBe('indoor');
    expect(arrivalSpawnForTravel(campus.id,lobby)).toEqual({x:640,y:672});
    expect(arrivalSpawnForTravel(lobby.id,campus)).toEqual({x:1312,y:800});
    expect(canTravel(joinSave({location:'empery_hq'}),lobby.id).ok).toBe(false);
    expect(canTravel(joinSave({location:'empery_hq',questFlags:{quest_empery_hq_access:true}}),lobby.id).ok).toBe(true);
    expect(canTravel(joinSave({location:'empery_hq_lobby',questFlags:{quest_empery_hq_access:true}}),campus.id).ok).toBe(true);
    expect(canTravel(joinSave({location:'empery_haven',questFlags:{quest_empery_hq_access:true}}),lobby.id).ok).toBe(false);
  });

  it('exits EmperyWorld HQ on the street south of the campus gate', () => {
    const haven = getLocation('empery_haven')!;
    const gate = haven.zones!.find((z) => z.travelTo === 'empery_hq')!;
    expect(gate).toBeTruthy();
    expect(gate.x).toBe(4128);
    expect(gate.y).toBe(2528);
    const arrival = arrivalSpawnForTravel('empery_hq', haven);
    expect(arrival).toEqual({ x: 4064, y: 2720 });
    expect(arrival.y).toBeGreaterThan(gate.y);
    expect(arrival.y).toBeGreaterThanOrEqual(40 * 64);
    expect(arrival).not.toEqual(haven.spawn);
  });
});

describe('authorizeJoinLocation', () => {
  it('allows presence attach on the save current map', () => {
    expect(authorizeJoinLocation(joinSave(), 'empery_haven')).toEqual({ ok: true });
  });

  it('rejects a gated destination with the travel deny reason', () => {
    const result = authorizeJoinLocation(joinSave({ questFlags: {} }), 'shadow_depths');
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('rejects an otherwise valid hop so HTTP /travel stays the mutator', () => {
    const result = authorizeJoinLocation(joinSave({ location: 'empery_haven' }), 'suburban_park');
    expect(result).toEqual({ ok: false, reason: 'Сначала используй переход' });
  });
});

describe('canTravel topology', () => {
  it('allows direct zone edges from the current location', () => {
    const result = canTravel(joinSave({ location: 'empery_haven' }), 'suburban_park');
    expect(result).toEqual({ ok: true });
  });

  it('rejects non-adjacent destination without a direct portal edge', () => {
    const result = canTravel(joinSave({ location: 'empery_haven' }), 'silverwood');
    expect(result).toEqual({ ok: false, reason: 'Отсюда нет прямого перехода' });
  });
});
