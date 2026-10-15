import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import { applyPriestVotiveChoice, generatePriestVotiveDialogue } from './priest-votive-dialogue.js';
import {
  CASSIUS_CANDLE_ITEM,
  CASSIUS_VOTIVE_BUFF_AMOUNT,
  CASSIUS_VOTIVE_BUFF_NAME,
  HAVEN_PRIEST_ALMS_FLAG,
  PRIEST_ALMS_COST,
  PRIEST_CANDLE_COST,
  buyCassiusCandle,
  givePriestAlms,
  priestAlmsCount,
} from './priest-votive.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-priest-player',
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

function loadPriestNpc(): HavenNpcLike {
  return parseYaml(readFileSync(join(contentRoot, 'npcs/town_priest.yaml'), 'utf8')) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_miller',
  name: 'Мельник Фаддей',
  defaultGreeting: 'Жернова крутятся.',
  choices: [],
  nodes: {},
};

describe('cassius_candle item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads from haven-priest.yaml as a common material candle', () => {
    const item = getItem(CASSIUS_CANDLE_ITEM);
    expect(item?.name).toBe('Свеча Кассия');
    expect(item?.slot).toBe('material');
    expect(item?.rarity).toBe('common');
    expect(item?.weight).toBe(0.05);
    expect(item?.icon).toBe('/media/assets/item_cassius_candle.webp');
  });
});

describe('buyCassiusCandle', () => {
  it('fails when the player cannot pay', () => {
    const s0 = testSave({ adena: 7 });
    const res = buyCassiusCandle(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(7);
    expect(res.save.inventory).not.toContain(CASSIUS_CANDLE_ITEM);
    expect(res.save.questFlags.buff_sup_cassius_votive_val).toBeUndefined();
    expect(res.message).toContain(String(PRIEST_CANDLE_COST));
  });

  it('gives cassius_candle and cassius_votive buff', () => {
    const res = buyCassiusCandle(testSave({ adena: 20 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - PRIEST_CANDLE_COST);
    expect(res.save.inventory).toContain(CASSIUS_CANDLE_ITEM);
    expect(res.save.questFlags.buff_sup_cassius_votive_val).toBe(CASSIUS_VOTIVE_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_cassius_votive_name).toBe(CASSIUS_VOTIVE_BUFF_NAME);
    expect(res.save.questFlags.buff_sup_cassius_votive_stat).toBe('mpRegen');
    expect(typeof res.save.questFlags.buff_sup_cassius_votive_until).toBe('string');
    expect(res.message).toContain(CASSIUS_VOTIVE_BUFF_NAME);
  });
});

describe('givePriestAlms', () => {
  it('increments haven_priest_alms without giving an item', () => {
    const first = givePriestAlms(testSave({ adena: 50 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(50 - PRIEST_ALMS_COST);
    expect(first.save.inventory).toEqual([]);
    expect(priestAlmsCount(first.save)).toBe(1);
    expect(first.save.questFlags[HAVEN_PRIEST_ALMS_FLAG]).toBe(1);

    const second = givePriestAlms(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(50 - PRIEST_ALMS_COST * 2);
    expect(priestAlmsCount(second.save)).toBe(2);
    expect(second.save.inventory).toEqual([]);
  });
});

describe('priest votive dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generatePriestVotiveDialogue(otherNpc, save)).toBeNull();
    expect(applyPriestVotiveChoice(otherNpc, save, 'priest_candle')).toBeNull();
  });

  it('hides priest_confess at karma 0 and shows it at karma 5', () => {
    const npc = loadPriestNpc();
    const clean = generatePriestVotiveDialogue(npc, testSave({ karma: 0 }));
    expect(clean).not.toBeNull();
    const cleanIds = clean!.choices.map((c) => c.id);
    expect(cleanIds).not.toContain('priest_confess');
    expect(cleanIds).toEqual(
      expect.arrayContaining([
        'priest_bless',
        'priest_candle',
        'priest_alms',
        'priest_lore',
        'priest_night',
        'priest_leave',
      ]),
    );

    const sinner = generatePriestVotiveDialogue(npc, testSave({ karma: 5 }));
    expect(sinner!.choices.map((c) => c.id)).toContain('priest_confess');
  });

  it('injects votive extras even if YAML omitted them', () => {
    const slim: HavenNpcLike = {
      id: 'town_priest',
      name: 'Отец Кассий',
      defaultGreeting: 'Мир тебе у ступеней собора.',
      choices: [
        { id: 'priest_bless', label: 'Попросить благословения Света (10 адены)', flag: '_priest_bless' },
        { id: 'priest_leave', label: 'Уйти с миром', flag: '_priest_done' },
      ],
      nodes: {},
    };
    const ids = generatePriestVotiveDialogue(slim, testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('priest_candle');
    expect(ids).toContain('priest_alms');
    expect(ids).toContain('priest_bless');
    expect(ids).not.toContain('priest_confess');
  });

  it('apply returns null for priest_bless and other YAML fallthrough ids', () => {
    const npc = loadPriestNpc();
    const save = testSave({ adena: 90, karma: 5 });
    expect(applyPriestVotiveChoice(npc, save, 'priest_bless')).toBeNull();
    expect(applyPriestVotiveChoice(npc, save, 'priest_confess')).toBeNull();
    expect(applyPriestVotiveChoice(npc, save, 'priest_lore')).toBeNull();
    expect(applyPriestVotiveChoice(npc, save, 'priest_night')).toBeNull();
    expect(applyPriestVotiveChoice(npc, save, 'priest_leave')).toBeNull();
    expect(applyPriestVotiveChoice(npc, save, 'priest_lore_bye')).toBeNull();
  });

  it('applies candle and alms through applyPriestVotiveChoice', () => {
    const npc = loadPriestNpc();
    const candle = applyPriestVotiveChoice(npc, testSave({ adena: 30 }), 'priest_candle');
    expect(candle).not.toBeNull();
    expect(candle!.save.inventory).toContain(CASSIUS_CANDLE_ITEM);
    expect(candle!.save.questFlags.buff_sup_cassius_votive_val).toBe(CASSIUS_VOTIVE_BUFF_AMOUNT);
    expect(candle!.followUp?.text).toContain(CASSIUS_VOTIVE_BUFF_NAME);

    const alms = applyPriestVotiveChoice(npc, testSave({ adena: 40 }), 'priest_alms');
    expect(alms).not.toBeNull();
    expect(alms!.save.questFlags[HAVEN_PRIEST_ALMS_FLAG]).toBe(1);
    expect(alms!.save.inventory).toEqual([]);
    expect(alms!.townMessage).toContain('Собор');
  });
});
