import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT, applyCombatPlayerDelta, buildCombatPlayerDelta } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';

function base(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 's1',
    name: 'T',
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 10,
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 40,
    location: 'adena_fields',
    adena: 50,
    inventory: ['rusty_sword'],
    equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: { quest_grove_kills: 1 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('combat-delta', () => {
  it('omits heavy fields when unchanged', () => {
    const before = base();
    const after = base({ hp: 90, xp: 15, mp: 18 });
    const delta = buildCombatPlayerDelta(before, after);
    expect(delta.hp).toBe(90);
    expect(delta.xp).toBe(15);
    expect(delta.inventory).toBeUndefined();
    expect(delta.questFlags).toBeUndefined();
    expect(delta.equipment).toBeUndefined();
  });

  it('includes stamina when it changes', () => {
    const before = base({ stamina: 800, staminaAt: '2026-01-01T00:00:00.000Z' });
    const after = base({ stamina: 760, staminaAt: '2026-01-01T00:00:01.000Z' });
    const delta = buildCombatPlayerDelta(before, after);
    expect(delta.stamina).toBe(760);
    const next = applyCombatPlayerDelta(before, delta);
    expect(next.stamina).toBe(760);
  });

  it('includes inventory/questFlags when changed', () => {
    const before = base();
    const after = base({
      inventory: ['rusty_sword', 'wooden_arrow'],
      questFlags: { quest_grove_kills: 2 },
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword', quiver: 'wooden_arrow' },
    });
    const delta = buildCombatPlayerDelta(before, after);
    expect(delta.inventory).toEqual(['rusty_sword', 'wooden_arrow']);
    expect(delta.questFlags).toEqual({ quest_grove_kills: 2 });
    expect(delta.equipment?.quiver).toBe('wooden_arrow');
  });

  it('apply merges patches onto local save', () => {
    const local = base({ inventory: ['a', 'b'], questFlags: { x: 1 } });
    const delta = buildCombatPlayerDelta(
      local,
      base({ hp: 50, xp: 99, inventory: ['a'], questFlags: { x: 2 } }),
    );
    const next = applyCombatPlayerDelta(local, delta);
    expect(next.hp).toBe(50);
    expect(next.xp).toBe(99);
    expect(next.inventory).toEqual(['a']);
    expect(next.questFlags).toEqual({ x: 2 });
    expect(next.name).toBe('T');
  });
});
