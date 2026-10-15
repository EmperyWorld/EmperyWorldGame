import { describe, expect, it } from 'vitest';
import { PartyService, PARTY_MAX_SIZE, PARTY_XP_RANGE } from './party.js';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';

function save(partial: Partial<PlayerSave> & { id: string; name: string }): PlayerSave {
  return {
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'adena_fields',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe('PartyService', () => {
  it('invites, accepts and shares eligibility by distance', () => {
    const parties = new PartyService();
    const a = save({ id: 'a', name: 'Альфа' });
    const b = save({ id: 'b', name: 'Бета' });
    const c = save({ id: 'c', name: 'Гамма' });

    const inv = parties.invite(a, b);
    expect('invite' in inv).toBe(true);
    if (!('invite' in inv)) return;

    const acc = parties.accept(b, inv.invite.partyId);
    expect('party' in acc).toBe(true);
    if (!('party' in acc)) return;
    expect(acc.party.memberSaveIds.sort()).toEqual(['a', 'b']);

    const positions = new Map([
      ['a', { x: 0, y: 0, locationId: 'adena_fields' }],
      ['b', { x: 100, y: 0, locationId: 'adena_fields' }],
      ['c', { x: PARTY_XP_RANGE + 50, y: 0, locationId: 'adena_fields' }],
    ]);

    parties.invite(a, c);
    // c not accepted

    const lookup = {
      presenceForSave: (id: string) => {
        const p = positions.get(id);
        const s = id === 'a' ? a : id === 'b' ? b : c;
        if (!p) return null;
        return {
          saveId: id,
          name: s.name,
          level: s.level,
          race: s.race,
          profession: s.profession,
          locationId: p.locationId,
          x: p.x,
          y: p.y,
          hp: s.hp,
          maxHp: s.maxHp,
        };
      },
      loadSave: (id: string) => (id === 'a' ? a : id === 'b' ? b : id === 'c' ? c : null),
    };

    const eligible = parties.eligibleForKillXp('a', lookup);
    expect(eligible.shareCount).toBe(2);
    expect(eligible.saveIds.sort()).toEqual(['a', 'b']);
  });

  it('rejects invite when full and transfers leader on leave', () => {
    const parties = new PartyService();
    const leader = save({ id: 'l', name: 'Лидер' });
    const members = Array.from({ length: PARTY_MAX_SIZE - 1 }, (_, i) =>
      save({ id: `m${i}`, name: `M${i}` }),
    );

    for (const m of members) {
      const inv = parties.invite(leader, m);
      expect('invite' in inv).toBe(true);
      if (!('invite' in inv)) return;
      parties.accept(m, inv.invite.partyId);
    }

    const extra = save({ id: 'x', name: 'Лишний' });
    const full = parties.invite(leader, extra);
    expect('error' in full).toBe(true);

    const left = parties.leave('l');
    expect('party' in left).toBe(true);
    if (!('party' in left) || !left.party) return;
    expect(left.party.leaderSaveId).not.toBe('l');
    expect(left.party.memberSaveIds).not.toContain('l');
  });
});
