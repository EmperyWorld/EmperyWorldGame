import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { emptyHousingStorages } from './housing.js';
import { getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import {
  applyApartmentFridgeChoice,
  generateApartmentFridgeDialogue,
} from './apartment-fridge-dialogue.js';
import {
  APT_RATION_ALREADY_TAKEN,
  APT_RATION_ITEM,
  APT_RATION_NO_HOUSING,
  HAVEN_APT_RATION_DAY_FLAG,
  takeAptRation,
  utcDayOfYear,
} from './apartment-fridge.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-apt-fridge-player',
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

function ownedHousing(tier: 1 | 2 | 3 = 1): NonNullable<PlayerSave['housing']> {
  return {
    tier,
    purchasedAt: new Date().toISOString(),
    storages: emptyHousingStorages(),
  };
}

function fridgeNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/apartment_fridge.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

const DAY_ONE = new Date('2026-03-15T12:00:00.000Z');
const SAME_DAY_LATER = new Date('2026-03-15T23:30:00.000Z');
const NEXT_DAY = new Date('2026-03-16T00:15:00.000Z');

describe('apt_ration item', () => {
  it('loads apt_ration from haven-apt-fridge.yaml', () => {
    const item = getItem(APT_RATION_ITEM);
    expect(item?.name).toBe('Паёк жильца');
    expect(item?.slot).toBe('consumable');
    expect(item?.survival?.nutrition).toBe(12);
    expect(item?.icon).toBe('/media/assets/item_apt_ration.webp');
  });
});

describe('takeAptRation', () => {
  it('fails without housing and keeps the save', () => {
    const s0 = testSave({ inventory: ['bread_loaf'] });
    const res = takeAptRation(s0, DAY_ONE);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(APT_RATION_NO_HOUSING);
    expect(res.save).toBe(s0);
    expect(res.save.inventory).toEqual(['bread_loaf']);
    expect(res.save.questFlags[HAVEN_APT_RATION_DAY_FLAG]).toBeUndefined();
  });

  it('gives one apt_ration on the first take of the UTC day', () => {
    const res = takeAptRation(testSave({ housing: ownedHousing(1) }), DAY_ONE);
    expect(res.ok).toBe(true);
    expect(res.save.inventory).toContain(APT_RATION_ITEM);
    expect(res.save.inventory.filter((id) => id === APT_RATION_ITEM)).toHaveLength(1);
    expect(res.save.questFlags[HAVEN_APT_RATION_DAY_FLAG]).toBe(utcDayOfYear(DAY_ONE));
    expect(res.message).toContain('паёк');
  });

  it('fails a second take on the same UTC day', () => {
    const first = takeAptRation(testSave({ housing: ownedHousing(1) }), DAY_ONE);
    expect(first.ok).toBe(true);
    const second = takeAptRation(first.save, SAME_DAY_LATER);
    expect(second.ok).toBe(false);
    expect(second.message).toBe(APT_RATION_ALREADY_TAKEN);
    expect(second.save.inventory.filter((id) => id === APT_RATION_ITEM)).toHaveLength(1);
    expect(second.save.questFlags[HAVEN_APT_RATION_DAY_FLAG]).toBe(utcDayOfYear(DAY_ONE));
  });

  it('allows a new ration on the next UTC day when Date is passed', () => {
    const first = takeAptRation(testSave({ housing: ownedHousing(2) }), DAY_ONE);
    expect(first.ok).toBe(true);
    const next = takeAptRation(first.save, NEXT_DAY);
    expect(next.ok).toBe(true);
    expect(next.save.inventory.filter((id) => id === APT_RATION_ITEM)).toHaveLength(2);
    expect(next.save.questFlags[HAVEN_APT_RATION_DAY_FLAG]).toBe(utcDayOfYear(NEXT_DAY));
    expect(utcDayOfYear(NEXT_DAY)).not.toBe(utcDayOfYear(DAY_ONE));
  });
});

describe('apartment fridge dialogue plugin', () => {
  it('generateApartmentFridgeDialogue returns null for other npcs', () => {
    expect(
      generateApartmentFridgeDialogue(fridgeNpc({ id: 'apartment_chest' }), testSave()),
    ).toBeNull();
  });

  it('generate menu is open_storage + apt_ration', () => {
    const dlg = generateApartmentFridgeDialogue(
      fridgeNpc(),
      testSave({ housing: ownedHousing(1) }),
    );
    expect(dlg).not.toBeNull();
    expect(dlg!.choices.map((c) => c.id)).toEqual(['open_storage', 'apt_ration']);
    expect(dlg!.choices.find((c) => c.id === 'apt_ration')?.label).toBe('Взять паёк жильца');
  });

  it('apply returns null for open_storage so client storage still works', () => {
    const save = testSave({ housing: ownedHousing(1) });
    expect(applyApartmentFridgeChoice(fridgeNpc(), save, 'open_storage')).toBeNull();
  });

  it('apply returns null for unknown npc', () => {
    expect(
      applyApartmentFridgeChoice(
        fridgeNpc({ id: 'apartment_chest' }),
        testSave({ housing: ownedHousing(1) }),
        'apt_ration',
      ),
    ).toBeNull();
  });

  it('applies apt_ration via dialogue and keeps open_storage in follow-up', () => {
    const applied = applyApartmentFridgeChoice(
      fridgeNpc(),
      testSave({ housing: ownedHousing(1) }),
      'apt_ration',
      DAY_ONE,
    );
    expect(applied).not.toBeNull();
    expect(applied!.save.inventory).toContain(APT_RATION_ITEM);
    expect(applied!.save.questFlags[HAVEN_APT_RATION_DAY_FLAG]).toBe(utcDayOfYear(DAY_ONE));
    expect(applied!.townMessage).toContain('паёк');
    const ids = applied!.followUp?.choices.map((c) => c.id) ?? [];
    expect(ids).toEqual(['open_storage', 'apt_ration']);
  });

  it('yaml lists open_storage and apt_ration', () => {
    const ids = fridgeNpc().choices.map((c) => c.id);
    expect(ids).toEqual(['open_storage', 'apt_ration']);
  });
});
