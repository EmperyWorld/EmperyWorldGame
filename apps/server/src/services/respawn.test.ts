import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import {
  applyDeathXpPenalty,
  applyDoomAdenaPenalty,
  consumeResurrectionScroll,
  markCombatDeath,
  respawnInTown,
  resurrectionPosition,
} from './respawn.js';
import { REVIVE_FATIGUE_CAP } from './survival.js';

function base(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 's1',
    name: 'T',
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 100,
    hp: 0,
    maxHp: 100,
    mp: 10,
    maxMp: 40,
    location: 'adena_fields',
    adena: 50,
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

describe('respawn', () => {
  it('loses 25% of current level xp', () => {
    const { save, xpLost } = applyDeathXpPenalty(base({ xp: 100 }));
    expect(xpLost).toBe(25);
    expect(save.xp).toBe(75);
    expect(save.level).toBe(5);
  });

  it('Гибель takes 40% of current level xp', () => {
    const { save, xpLost } = applyDeathXpPenalty(base({ xp: 100, lastDeathKind: 'doom' }));
    expect(xpLost).toBe(40);
    expect(save.xp).toBe(60);
  });

  it('town respawn moves to haven and applies penalty', () => {
    const { save, xpLost, locationId } = respawnInTown(base({ xp: 80, hp: 0 }));
    expect(locationId).toBe('empery_haven');
    expect(save.location).toBe('empery_haven');
    expect(xpLost).toBe(20);
    expect(save.xp).toBe(60);
    expect(save.hp).toBeGreaterThan(0);
    expect(save.mount?.mounted ?? false).toBe(false);
  });

  it('caps fatigue after town respawn so collapse cannot immediately repeat', () => {
    const startedAt = new Date().toISOString();
    const { save } = respawnInTown(
      base({
        xp: 80,
        hp: 0,
        lastDeathCause: 'Потерял сознание: усталость. После воскрешения потребуется лечение.',
        survival: {
          version: 1,
          satiety: 80,
          hydration: 80,
          bodyTemperature: 37,
          fatigue: 96,
          wetness: 0,
          conditions: [
            { id: 'fatigued', severity: 'critical', kind: 'deficit', startedAt },
            { id: 'exhaustion_injury', severity: 'deficit', kind: 'injury', startedAt },
          ],
          events: [],
          lastSimulatedAt: startedAt,
          restingUntil: null,
        },
      }),
    );
    expect(save.survival!.fatigue).toBeLessThanOrEqual(REVIVE_FATIGUE_CAP);
    expect(save.survival!.conditions.some((c) => c.id === 'fatigued' && c.severity === 'critical')).toBe(false);
    expect(save.survival!.conditions.some((c) => c.id === 'exhaustion_injury')).toBe(true);
    expect(save.lastDeathCause).toBeNull();
    expect(save.lastDeathKind).toBeNull();
    expect(save.survival!.doomGraceUntil).toBeTruthy();
    expect(Date.parse(save.survival!.doomGraceUntil!)).toBeGreaterThan(Date.now());
  });

  it('Гибель town respawn takes 40% xp and 10% adena', () => {
    const { save, xpLost, adenaLost, deathKind } = respawnInTown(
      base({
        xp: 100,
        adena: 80,
        lastDeathKind: 'doom',
        lastDeathCause: 'Гибель: голод. Повторный обморок при невылеченной травме.',
      }),
    );
    expect(deathKind).toBe('doom');
    expect(xpLost).toBe(40);
    expect(adenaLost).toBe(8);
    expect(save.adena).toBe(72);
  });

  it('does not tax adena on a first faint', () => {
    const { adenaLost } = applyDoomAdenaPenalty(
      base({ adena: 80, lastDeathKind: 'faint', lastDeathCause: 'Потерял сознание: голод.' }),
    );
    expect(adenaLost).toBe(0);
  });

  it('combat death with untreated injury is Гибель', () => {
    const startedAt = new Date().toISOString();
    const marked = markCombatDeath(
      base({
        hp: 0,
        survival: {
          version: 1,
          satiety: 40,
          hydration: 40,
          bodyTemperature: 37,
          fatigue: 20,
          wetness: 0,
          conditions: [{ id: 'exhaustion_injury', severity: 'deficit', kind: 'injury', startedAt }],
          events: [],
          lastSimulatedAt: startedAt,
          restingUntil: null,
        },
      }),
      'Убит мобом (wolf, ур.3)',
    );
    expect(marked.lastDeathKind).toBe('doom');
    expect(marked.lastDeathCause).toContain('Гибель');
    expect(marked.lastDeathCause).toContain('wolf');
  });

  it('combat death in a safe zone stays Поражение even with injury', () => {
    const startedAt = new Date().toISOString();
    const marked = markCombatDeath(
      base({
        hp: 0,
        location: 'empery_haven',
        survival: {
          version: 1,
          satiety: 40,
          hydration: 40,
          bodyTemperature: 37,
          fatigue: 20,
          wetness: 0,
          conditions: [{ id: 'exhaustion_injury', severity: 'deficit', kind: 'injury', startedAt }],
          events: [],
          lastSimulatedAt: startedAt,
          restingUntil: null,
        },
      }),
      'Убит игроком X',
    );
    expect(marked.lastDeathKind).toBe('combat');
    expect(marked.lastDeathCause).toBe('Убит игроком X');
  });

  it('combat death during revive grace stays Поражение', () => {
    const startedAt = new Date().toISOString();
    const marked = markCombatDeath(
      base({
        hp: 0,
        location: 'adena_fields',
        survival: {
          version: 1,
          satiety: 40,
          hydration: 40,
          bodyTemperature: 37,
          fatigue: 20,
          wetness: 0,
          conditions: [{ id: 'exhaustion_injury', severity: 'deficit', kind: 'injury', startedAt }],
          events: [],
          lastSimulatedAt: startedAt,
          restingUntil: null,
          doomGraceUntil: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
      'Убит мобом (wolf, ур.3)',
    );
    expect(marked.lastDeathKind).toBe('combat');
  });

  it('consumes one resurrection scroll', () => {
    const next = consumeResurrectionScroll(
      base({ inventory: ['rusty_sword', 'resurrection_scroll', 'resurrection_scroll'] }),
    );
    expect(next?.inventory).toEqual(['rusty_sword', 'resurrection_scroll']);
  });
});

describe('resurrection coordinate resolution',()=>{
 it('prefers finite live coordinates from the current map',()=>{
  expect(resurrectionPosition(base({worldX:10,worldY:20}),{locationId:'adena_fields',x:100,y:200})).toEqual({x:100,y:200});
 });
 it.each([{locationId:'other',x:100,y:200},{locationId:'adena_fields',x:NaN,y:200}])('ignores a foreign or invalid live pose',presence=>{
  expect(resurrectionPosition(base({worldX:10,worldY:20}),presence)).toEqual({x:10,y:20});
 });
 it('does not invent a position for an unknown actor',()=>{
  expect(resurrectionPosition(base(),null)).toBeNull();
 });
});
