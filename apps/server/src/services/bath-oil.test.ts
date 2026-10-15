import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { applyBathOilChoice, generateBathOilDialogue } from './bath-oil-dialogue.js';
import {
  BATH_OIL_COST,
  NIKA_OIL_BUFF_AMOUNT,
  NIKA_OIL_BUFF_NAME,
  NIKA_OIL_ITEM,
  buyNikaOil,
} from './bath-oil.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

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
    karma: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function bathNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_bathkeeper.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('nika_oil item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads nika_oil from haven-bath.yaml', () => {
    const item = getItem(NIKA_OIL_ITEM);
    expect(item?.name).toBe('Масло Ники');
    expect(item?.slot).toBe('material');
    expect(item?.rarity).toBe('common');
    expect(item?.weight).toBe(0.2);
    expect(item?.icon).toBe('/media/assets/item_nika_oil.webp');
  });
});

describe('buyNikaOil', () => {
  it('rejects oil if player cannot pay', () => {
    const s0 = testSave({ adena: 10 });
    const res = buyNikaOil(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(10);
    expect(res.save.inventory).not.toContain(NIKA_OIL_ITEM);
    expect(res.save.questFlags.buff_sup_nika_oil_val).toBeUndefined();
    expect(res.save.questFlags.buff_sup_bath_steam_val).toBeUndefined();
    expect(res.message).toContain(String(BATH_OIL_COST));
  });

  it('costs 18 adena, gives nika_oil and speed buff flags', () => {
    const s0 = testSave({ adena: 40 });
    const res = buyNikaOil(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 - BATH_OIL_COST);
    expect(res.save.inventory).toContain(NIKA_OIL_ITEM);
    expect(res.save.questFlags.buff_sup_nika_oil_val).toBe(NIKA_OIL_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_nika_oil_stat).toBe('speed');
    expect(res.save.questFlags.buff_sup_nika_oil_name).toBe(NIKA_OIL_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_nika_oil_until).toBe('string');
    expect(res.save.questFlags.buff_sup_bath_steam_val).toBeUndefined();
    expect(res.message).toContain(NIKA_OIL_BUFF_NAME);
  });

  it('is repeatable', () => {
    const first = buyNikaOil(testSave({ adena: 50 }));
    const second = buyNikaOil(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(50 - BATH_OIL_COST * 2);
    expect(second.save.inventory.filter((id) => id === NIKA_OIL_ITEM)).toHaveLength(2);
    expect(second.save.questFlags.buff_sup_nika_oil_val).toBe(NIKA_OIL_BUFF_AMOUNT);
  });
});

describe('bath oil dialogue plugin', () => {
  it('returns null for other npcs', () => {
    const save = testSave();
    const other = bathNpc({ id: 'town_miller' });
    expect(generateBathOilDialogue(other, save)).toBeNull();
    expect(applyBathOilChoice(other, save, 'bath_oil')).toBeNull();
  });

  it('generate includes bath_tea and bath_oil', () => {
    const dlg = generateBathOilDialogue(bathNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('bath_tea');
    expect(ids).toContain('bath_oil');
    expect(ids).toContain('bath_session');
    expect(ids).toContain('bath_rest');
    expect(ids).toContain('bath_rules');
    expect(ids).toContain('bath_leave');
  });

  it('injects bath_oil even if YAML omitted it', () => {
    const slim: HavenNpcLike = {
      id: 'town_bathkeeper',
      name: 'Банщица Ника',
      defaultGreeting: 'Пар готов.',
      choices: [
        { id: 'bath_session', label: 'Оплатить парную', flag: '_bath_session' },
        { id: 'bath_tea', label: 'Травяной банный взвар', flag: '_bath_tea' },
        { id: 'bath_leave', label: 'Уйти', flag: '_bath_done' },
      ],
      nodes: {},
    };
    const ids = generateBathOilDialogue(slim, testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('bath_oil');
    expect(ids).toContain('bath_tea');
    expect(ids).toContain('bath_session');
  });

  it('apply returns null for bath_session, bath_tea and YAML flavor', () => {
    const npc = bathNpc();
    const save = testSave();
    expect(applyBathOilChoice(npc, save, 'bath_session')).toBeNull();
    expect(applyBathOilChoice(npc, save, 'bath_tea')).toBeNull();
    expect(applyBathOilChoice(npc, save, 'bath_rest')).toBeNull();
    expect(applyBathOilChoice(npc, save, 'bath_rules')).toBeNull();
    expect(applyBathOilChoice(npc, save, 'bath_leave')).toBeNull();
    expect(applyBathOilChoice(npc, save, 'bath_steam_bye')).toBeNull();
    expect(applyBathOilChoice(npc, save, 'bath_rules_bye')).toBeNull();
  });

  it('applies bath_oil and keeps remaining choices including bath_tea', () => {
    const npc = bathNpc();
    const failed = applyBathOilChoice(npc, testSave({ adena: 5 }), 'bath_oil');
    expect(failed).not.toBeNull();
    expect(failed!.save.adena).toBe(5);
    expect(failed!.followUp?.text).toContain(String(BATH_OIL_COST));

    const bought = applyBathOilChoice(npc, testSave({ adena: 30 }), 'bath_oil');
    expect(bought).not.toBeNull();
    expect(bought!.save.adena).toBe(30 - BATH_OIL_COST);
    expect(bought!.save.inventory).toContain(NIKA_OIL_ITEM);
    expect(bought!.save.questFlags.buff_sup_nika_oil_stat).toBe('speed');
    expect(bought!.followUp?.choices.map((c) => c.id)).toContain('bath_tea');
    expect(bought!.followUp?.choices.map((c) => c.id)).toContain('bath_oil');
    expect(bought!.followUp?.choices.map((c) => c.id)).toContain('bath_session');
  });
});
