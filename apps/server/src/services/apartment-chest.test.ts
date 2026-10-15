import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import {
  applyApartmentChestChoice,
  generateApartmentChestDialogue,
} from './apartment-chest-dialogue.js';
import {
  APT_KIT_COST,
  APT_KIT_NO_HOUSING,
  APT_TRAVEL_KIT_ITEM,
  assembleAptKit,
} from './apartment-chest.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-apartment-chest-player',
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
    storages: { materials: [], gear: [], food: [] },
  };
}

function tenantSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  return testSave({
    housing: ownedHousing(1),
    ...overrides,
  });
}

function chestNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/apartment_chest.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('apt_travel_kit item', () => {
  it('loads from haven-apt-chest.yaml as material weight 0.4', () => {
    const item = getItem(APT_TRAVEL_KIT_ITEM);
    expect(item?.name).toBe('Дорожный набор');
    expect(item?.slot).toBe('material');
    expect(item?.weight).toBe(0.4);
    expect(item?.icon).toBe('/media/assets/item_apt_travel_kit.webp');
  });
});

describe('assembleAptKit', () => {
  it('fails without housing and keeps the save', () => {
    const s0 = testSave({ adena: 50, inventory: ['iron_ore'] });
    const res = assembleAptKit(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(APT_KIT_NO_HOUSING);
    expect(res.save).toBe(s0);
    expect(res.save.adena).toBe(50);
    expect(res.save.inventory).toEqual(['iron_ore']);
    expect(res.save.inventory).not.toContain(APT_TRAVEL_KIT_ITEM);
  });

  it('fails when player cannot pay and mentions the amount', () => {
    const s0 = tenantSave({ adena: 10 });
    const res = assembleAptKit(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(APT_KIT_COST));
    expect(res.message).toContain('10');
    expect(res.save).toBe(s0);
    expect(res.save.adena).toBe(10);
    expect(res.save.inventory).not.toContain(APT_TRAVEL_KIT_ITEM);
  });

  it('spends 15 adena and grants apt_travel_kit', () => {
    const s0 = tenantSave({ adena: 40, inventory: ['iron_ore'] });
    const res = assembleAptKit(s0);
    expect(res.ok).toBe(true);
    expect(APT_KIT_COST).toBe(15);
    expect(res.save.adena).toBe(40 - APT_KIT_COST);
    expect(res.save.inventory).toContain(APT_TRAVEL_KIT_ITEM);
    expect(res.save.inventory).toContain('iron_ore');
    expect(res.save.housing).toEqual(s0.housing);
    expect(res.message).toContain('дорожный набор');
  });

  it('is repeatable and not daily', () => {
    const first = assembleAptKit(tenantSave({ adena: 40 }));
    expect(first.ok).toBe(true);
    const second = assembleAptKit(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(40 - APT_KIT_COST * 2);
    expect(second.save.inventory.filter((id) => id === APT_TRAVEL_KIT_ITEM)).toHaveLength(2);
  });
});

describe('apartment chest dialogue plugin', () => {
  it('generateApartmentChestDialogue returns null for other npcs', () => {
    expect(generateApartmentChestDialogue(chestNpc({ id: 'apartment_rack' }), testSave())).toBeNull();
  });

  it('shows open_storage and apt_kit', () => {
    const dlg = generateApartmentChestDialogue(chestNpc(), tenantSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toEqual(['open_storage', 'apt_kit']);
    expect(dlg!.choices.find((c) => c.id === 'apt_kit')?.label).toBe(
      'Собрать дорожный набор (15 адены)',
    );
  });

  it('still shows both choices without housing', () => {
    const ids = generateApartmentChestDialogue(chestNpc(), testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('open_storage');
    expect(ids).toContain('apt_kit');
  });

  it('apply returns null for open_storage so client materials bag still works', () => {
    const npc = chestNpc();
    const save = tenantSave();
    expect(applyApartmentChestChoice(npc, save, 'open_storage')).toBeNull();
  });

  it('apply returns null for unknown npc', () => {
    expect(
      applyApartmentChestChoice(chestNpc({ id: 'apartment_rack' }), tenantSave(), 'apt_kit'),
    ).toBeNull();
  });

  it('applies apt_kit via dialogue and keeps open_storage in follow-up', () => {
    const applied = applyApartmentChestChoice(chestNpc(), tenantSave({ adena: 40 }), 'apt_kit');
    expect(applied).not.toBeNull();
    expect(applied!.save.adena).toBe(40 - APT_KIT_COST);
    expect(applied!.save.inventory).toContain(APT_TRAVEL_KIT_ITEM);
    expect(applied!.townMessage).toContain('дорожный набор');
    const ids = applied!.followUp?.choices.map((c) => c.id) ?? [];
    expect(ids).toContain('open_storage');
    expect(ids).toContain('apt_kit');
  });

  it('apply apt_kit without housing fails and does not spend adena', () => {
    const applied = applyApartmentChestChoice(chestNpc(), testSave({ adena: 40 }), 'apt_kit');
    expect(applied).not.toBeNull();
    expect(applied!.save.adena).toBe(40);
    expect(applied!.save.inventory).not.toContain(APT_TRAVEL_KIT_ITEM);
    expect(applied!.followUp?.text).toBe(APT_KIT_NO_HOUSING);
  });

  it('yaml lists apt_kit without dropping open_storage', () => {
    const npc = chestNpc();
    const ids = npc.choices.map((c) => c.id);
    expect(ids).toEqual(['open_storage', 'apt_kit']);
    expect(npc.choices.find((c) => c.id === 'apt_kit')?.label).toBe(
      'Собрать дорожный набор (15 адены)',
    );
  });
});
