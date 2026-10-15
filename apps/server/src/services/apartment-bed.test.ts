import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import {
  applyApartmentBedChoice,
  generateApartmentBedDialogue,
} from './apartment-bed-dialogue.js';
import {
  APT_LINEN_BUFF_AMOUNT,
  APT_LINEN_BUFF_NAME,
  APT_LINEN_NO_HOUSING,
  apartmentLinenRest,
} from './apartment-bed.js';

function ownedHousing(tier: 1 | 2 | 3 = 1): NonNullable<PlayerSave['housing']> {
  return {
    tier,
    purchasedAt: new Date().toISOString(),
    storages: { materials: [], gear: [], food: [] },
  };
}

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-apartment-bed-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'warrior',
    level: 2,
    xp: 0,
    hp: 40,
    maxHp: 100,
    mp: 10,
    maxMp: 50,
    location: 'haven_apartment',
    adena: 100,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function bedNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/apartment_bed.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('apartmentLinenRest', () => {
  it('fails without housing and keeps the save', () => {
    const s0 = testSave({ adena: 50, hp: 20 });
    const res = apartmentLinenRest(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(APT_LINEN_NO_HOUSING);
    expect(res.save).toBe(s0);
    expect(res.save.adena).toBe(50);
    expect(res.save.hp).toBe(20);
    expect(res.save.questFlags.buff_sup_apt_linen_val).toBeUndefined();
  });

  it('with housing: free rest, HP/MP full, Чистые простыни buff, repeatable', () => {
    const s0 = testSave({
      housing: ownedHousing(1),
      adena: 40,
      hp: 40,
      mp: 10,
    });
    const res = apartmentLinenRest(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40);
    expect(res.save.hp).toBe(res.save.maxHp);
    expect(res.save.mp).toBe(res.save.maxMp);
    expect(res.save.questFlags.buff_sup_apt_linen_val).toBe(APT_LINEN_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_apt_linen_stat).toBe('mpRegen');
    expect(res.save.questFlags.buff_sup_apt_linen_name).toBe(APT_LINEN_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_apt_linen_until).toBe('string');
    expect(res.message).toContain(APT_LINEN_BUFF_NAME);

    const again = apartmentLinenRest(res.save);
    expect(again.ok).toBe(true);
    expect(again.save.adena).toBe(40);
    expect(again.save.questFlags.buff_sup_apt_linen_val).toBe(APT_LINEN_BUFF_AMOUNT);
  });
});

describe('apartment bed dialogue plugin', () => {
  it('generateApartmentBedDialogue returns null for other npcs', () => {
    expect(generateApartmentBedDialogue(bedNpc({ id: 'apartment_chest' }), testSave())).toBeNull();
  });

  it('generate always includes rest_here and apt_linen', () => {
    const dlg = generateApartmentBedDialogue(bedNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('rest_here');
    expect(ids).toContain('apt_linen');
  });

  it('generate still shows both choices without housing', () => {
    const ids = generateApartmentBedDialogue(bedNpc(), testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('rest_here');
    expect(ids).toContain('apt_linen');
  });

  it('apply returns null for rest_here so the client rest API stays', () => {
    const save = testSave({ housing: ownedHousing(1) });
    expect(applyApartmentBedChoice(bedNpc(), save, 'rest_here')).toBeNull();
  });

  it('apply returns null for unknown npc', () => {
    expect(
      applyApartmentBedChoice(
        bedNpc({ id: 'apartment_chest' }),
        testSave({ housing: ownedHousing(1) }),
        'apt_linen',
      ),
    ).toBeNull();
  });

  it('applies linen rest via dialogue and keeps both choices in follow-up', () => {
    const applied = applyApartmentBedChoice(
      bedNpc(),
      testSave({ housing: ownedHousing(1), adena: 40, hp: 40, mp: 10 }),
      'apt_linen',
    );
    expect(applied).not.toBeNull();
    expect(applied!.save.adena).toBe(40);
    expect(applied!.save.hp).toBe(applied!.save.maxHp);
    expect(applied!.save.questFlags.buff_sup_apt_linen_val).toBe(APT_LINEN_BUFF_AMOUNT);
    expect(applied!.townMessage).toContain(APT_LINEN_BUFF_NAME);
    const ids = applied!.followUp?.choices.map((c) => c.id) ?? [];
    expect(ids).toContain('rest_here');
    expect(ids).toContain('apt_linen');
  });

  it('apply linen without housing fails with Edmund copy', () => {
    const applied = applyApartmentBedChoice(bedNpc(), testSave({ hp: 20 }), 'apt_linen');
    expect(applied).not.toBeNull();
    expect(applied!.followUp?.text).toBe(APT_LINEN_NO_HOUSING);
    expect(applied!.save.hp).toBe(20);
    expect(applied!.save.questFlags.buff_sup_apt_linen_val).toBeUndefined();
  });

  it('yaml lists rest_here and apt_linen', () => {
    const npc = bedNpc();
    const ids = npc.choices.map((c) => c.id);
    expect(ids).toEqual(['rest_here', 'apt_linen']);
    expect(npc.choices.find((c) => c.id === 'apt_linen')?.label).toBe('Перестелить и отдохнуть');
  });
});
