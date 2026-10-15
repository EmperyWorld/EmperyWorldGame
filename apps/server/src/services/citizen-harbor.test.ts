import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT, PLAYER_STAMINA_MAX } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  HARBOR_CHARM_ITEM,
  HARBOR_HAUL_REWARD_ADENA,
  HARBOR_HAUL_STAMINA_COST,
  HARBOR_KNOT_BUFF_AMOUNT,
  HARBOR_KNOT_BUFF_NAME,
  HARBOR_KNOT_COST,
  harborHaul,
  harborKnot,
} from './citizen-harbor.js';
import {
  applyCitizenHarborChoice,
  generateCitizenHarborDialogue,
} from './citizen-harbor-dialogue.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-haven-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'warrior',
    level: 2,
    xp: 0,
    hp: 40,
    maxHp: 100,
    mp: 10,
    maxMp: 50,
    location: 'empery_haven',
    adena: 100,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    stamina: PLAYER_STAMINA_MAX,
    staminaAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function harborNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/haven_citizen_harbor.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('harbor_charm item', () => {
  it('loads harbor_charm as material from haven-citizen-harbor.yaml', () => {
    expect(getItem(HARBOR_CHARM_ITEM)?.name).toBe('Оберег причала');
    expect(getItem(HARBOR_CHARM_ITEM)?.slot).toBe('material');
    expect(getItem(HARBOR_CHARM_ITEM)?.icon).toBe('/media/assets/item_harbor_charm.webp');
  });
});

describe('harborKnot', () => {
  it('fails without enough adena and does not grant item or buff', () => {
    const res = harborKnot(testSave({ adena: 5 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.inventory).toEqual([]);
    expect(res.save.questFlags.buff_sup_harbor_knot_val).toBeUndefined();
    expect(res.message).toContain(String(HARBOR_KNOT_COST));
  });

  it('spends 6 adena, gives harbor_charm and harbor_knot speed buff', () => {
    const res = harborKnot(testSave({ adena: 20 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - HARBOR_KNOT_COST);
    expect(res.save.inventory).toContain(HARBOR_CHARM_ITEM);
    expect(res.save.questFlags.buff_sup_harbor_knot_val).toBe(HARBOR_KNOT_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_harbor_knot_stat).toBe('speed');
    expect(res.save.questFlags.buff_sup_harbor_knot_name).toBe(HARBOR_KNOT_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_harbor_knot_until).toBe('string');
    expect(res.message).toContain('Узел моряка');
  });

  it('is repeatable', () => {
    const first = harborKnot(testSave({ adena: 20 }));
    const second = harborKnot(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(20 - HARBOR_KNOT_COST * 2);
    expect(second.save.inventory.filter((id) => id === HARBOR_CHARM_ITEM)).toHaveLength(2);
  });
});

describe('harborHaul', () => {
  it('fails when stamina is below 60', () => {
    const res = harborHaul(testSave({ stamina: 59, adena: 10 }));
    expect(res.ok).toBe(false);
    expect(res.save.stamina).toBe(59);
    expect(res.save.adena).toBe(10);
    expect(res.message).toContain(String(HARBOR_HAUL_STAMINA_COST));
  });

  it('drains 60 stamina and pays 55 adena without a quest flag', () => {
    const res = harborHaul(testSave({ stamina: 80, adena: 10 }));
    expect(res.ok).toBe(true);
    expect(res.save.stamina).toBe(80 - HARBOR_HAUL_STAMINA_COST);
    expect(res.save.adena).toBe(10 + HARBOR_HAUL_REWARD_ADENA);
    expect(res.save.questFlags).toEqual({});
    expect(res.message).toContain(String(HARBOR_HAUL_REWARD_ADENA));
  });

  it('allows haul at exactly 60 stamina and clamps to 0', () => {
    const res = harborHaul(testSave({ stamina: HARBOR_HAUL_STAMINA_COST, adena: 0 }));
    expect(res.ok).toBe(true);
    expect(res.save.stamina).toBe(0);
    expect(res.save.adena).toBe(HARBOR_HAUL_REWARD_ADENA);
  });
});

describe('citizen harbor dialogue plugin', () => {
  it('generateCitizenHarborDialogue returns null for other npcs', () => {
    expect(generateCitizenHarborDialogue(harborNpc({ id: 'haven_citizen_plaza' }), testSave())).toBeNull();
  });

  it('shows knot, haul and rumor choices; greeting uses formatCitizenGreeting', () => {
    const dlg = generateCitizenHarborDialogue(
      harborNpc(),
      testSave({ questFlags: { quest_hq_lab_complete: true } }),
    );
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('harbor_knot');
    expect(ids).toContain('harbor_haul');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
    expect(dlg!.text).toContain('лаборатор');
  });

  it('applyCitizenHarborChoice returns null for unknown npc', () => {
    expect(
      applyCitizenHarborChoice(harborNpc({ id: 'haven_citizen_plaza' }), testSave(), 'harbor_knot'),
    ).toBeNull();
  });

  it('apply returns null for citizen_rumors, citizen_advice, citizen_leave', () => {
    const npc = harborNpc();
    const save = testSave();
    expect(applyCitizenHarborChoice(npc, save, 'citizen_rumors')).toBeNull();
    expect(applyCitizenHarborChoice(npc, save, 'citizen_advice')).toBeNull();
    expect(applyCitizenHarborChoice(npc, save, 'citizen_leave')).toBeNull();
  });

  it('apply harbor_knot grants item and buff via dialogue', () => {
    const applied = applyCitizenHarborChoice(harborNpc(), testSave({ adena: 12 }), 'harbor_knot');
    expect(applied).not.toBeNull();
    expect(applied!.save.inventory).toContain(HARBOR_CHARM_ITEM);
    expect(applied!.save.questFlags.buff_sup_harbor_knot_val).toBe(HARBOR_KNOT_BUFF_AMOUNT);
    expect(applied!.save.questFlags.buff_sup_harbor_knot_stat).toBe('speed');
    expect(applied!.save.adena).toBe(12 - HARBOR_KNOT_COST);
    expect(applied!.followUp?.choices.map((c) => c.id)).toContain('harbor_haul');
  });

  it('apply harbor_haul fails and succeeds through dialogue', () => {
    const npc = harborNpc();
    const failed = applyCitizenHarborChoice(npc, testSave({ stamina: 20, adena: 0 }), 'harbor_haul');
    expect(failed?.save.stamina).toBe(20);
    expect(failed?.save.adena).toBe(0);
    expect(failed?.followUp?.text).toContain(String(HARBOR_HAUL_STAMINA_COST));

    const ok = applyCitizenHarborChoice(
      npc,
      testSave({ stamina: HARBOR_HAUL_STAMINA_COST, adena: 3 }),
      'harbor_haul',
    );
    expect(ok?.save.stamina).toBe(0);
    expect(ok?.save.adena).toBe(3 + HARBOR_HAUL_REWARD_ADENA);
    expect(ok?.save.questFlags).toEqual({});
  });
});
