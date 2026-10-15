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
  applyApartmentRackChoice,
  generateApartmentRackDialogue,
} from './apartment-rack-dialogue.js';
import {
  APT_POLISH_BUFF_AMOUNT,
  APT_POLISH_BUFF_NAME,
  APT_POLISH_COST,
  APT_POLISH_NO_HOUSING,
  aptPolish,
} from './apartment-rack.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-apartment-rack-player',
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

function rackNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/apartment_rack.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('aptPolish', () => {
  it('fails without housing and keeps the save', () => {
    const s0 = testSave({ adena: 50, inventory: ['iron_sword'] });
    const res = aptPolish(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(APT_POLISH_NO_HOUSING);
    expect(res.save).toBe(s0);
    expect(res.save.adena).toBe(50);
    expect(res.save.inventory).toEqual(['iron_sword']);
    expect(res.save.questFlags.buff_sup_apt_polish_val).toBeUndefined();
  });

  it('fails when player cannot pay and mentions the amount', () => {
    const s0 = tenantSave({ adena: 4 });
    const res = aptPolish(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(APT_POLISH_COST));
    expect(res.message).toContain('4');
    expect(res.save).toBe(s0);
    expect(res.save.adena).toBe(4);
    expect(res.save.questFlags.buff_sup_apt_polish_val).toBeUndefined();
  });

  it('costs 10 adena, applies Натёртый доспех buff flags, no item required', () => {
    const s0 = tenantSave({ adena: 40, inventory: [] });
    const res = aptPolish(s0);
    expect(res.ok).toBe(true);
    expect(APT_POLISH_COST).toBe(10);
    expect(res.save.adena).toBe(40 - APT_POLISH_COST);
    expect(res.save.inventory).toEqual([]);
    expect(res.save.housing).toEqual(s0.housing);
    expect(res.save.questFlags.buff_sup_apt_polish_val).toBe(APT_POLISH_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_apt_polish_stat).toBe('pDef');
    expect(res.save.questFlags.buff_sup_apt_polish_name).toBe(APT_POLISH_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_apt_polish_until).toBe('string');
    expect(res.message).toContain(APT_POLISH_BUFF_NAME);
  });

  it('is repeatable and keeps the buff flags', () => {
    const first = aptPolish(tenantSave({ adena: 30 }));
    expect(first.ok).toBe(true);
    const second = aptPolish(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(30 - APT_POLISH_COST * 2);
    expect(second.save.questFlags.buff_sup_apt_polish_val).toBe(APT_POLISH_BUFF_AMOUNT);
    expect(second.save.questFlags.buff_sup_apt_polish_stat).toBe('pDef');
    expect(typeof second.save.questFlags.buff_sup_apt_polish_until).toBe('string');
  });
});

describe('apartment rack dialogue plugin', () => {
  it('generateApartmentRackDialogue returns null for other npcs', () => {
    expect(generateApartmentRackDialogue(rackNpc({ id: 'apartment_chest' }), testSave())).toBeNull();
  });

  it('shows open_storage and apt_polish', () => {
    const dlg = generateApartmentRackDialogue(rackNpc(), tenantSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toEqual(['open_storage', 'apt_polish']);
    expect(dlg!.choices.find((c) => c.id === 'apt_polish')?.label).toContain('Натереть доспех');
    expect(dlg!.choices.find((c) => c.id === 'apt_polish')?.label).toContain('10');
  });

  it('still shows both choices without housing', () => {
    const ids = generateApartmentRackDialogue(rackNpc(), testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('open_storage');
    expect(ids).toContain('apt_polish');
  });

  it('apply returns null for open_storage so client gear bag still works', () => {
    const npc = rackNpc();
    const save = tenantSave();
    expect(applyApartmentRackChoice(npc, save, 'open_storage')).toBeNull();
  });

  it('apply returns null for unknown npc', () => {
    expect(
      applyApartmentRackChoice(rackNpc({ id: 'apartment_chest' }), tenantSave(), 'apt_polish'),
    ).toBeNull();
  });

  it('applies polish via dialogue and keeps open_storage in follow-up', () => {
    const applied = applyApartmentRackChoice(rackNpc(), tenantSave({ adena: 40 }), 'apt_polish');
    expect(applied).not.toBeNull();
    expect(applied!.save.adena).toBe(40 - APT_POLISH_COST);
    expect(applied!.save.questFlags.buff_sup_apt_polish_val).toBe(APT_POLISH_BUFF_AMOUNT);
    expect(applied!.save.questFlags.buff_sup_apt_polish_stat).toBe('pDef');
    expect(applied!.townMessage).toContain(APT_POLISH_BUFF_NAME);
    const ids = applied!.followUp?.choices.map((c) => c.id) ?? [];
    expect(ids).toContain('open_storage');
    expect(ids).toContain('apt_polish');
  });

  it('apply polish without housing fails and does not spend adena', () => {
    const applied = applyApartmentRackChoice(rackNpc(), testSave({ adena: 40 }), 'apt_polish');
    expect(applied).not.toBeNull();
    expect(applied!.save.adena).toBe(40);
    expect(applied!.save.questFlags.buff_sup_apt_polish_val).toBeUndefined();
    expect(applied!.followUp?.text).toBe(APT_POLISH_NO_HOUSING);
  });

  it('yaml lists apt_polish without dropping open_storage', () => {
    const npc = rackNpc();
    const ids = npc.choices.map((c) => c.id);
    expect(ids).toEqual(['open_storage', 'apt_polish']);
    expect(npc.choices.find((c) => c.id === 'apt_polish')?.label).toBe(
      'Натереть доспех (10 адены)',
    );
  });
});
