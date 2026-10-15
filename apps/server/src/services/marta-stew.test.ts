import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { applyMartaStewChoice, generateMartaStewDialogue } from './marta-stew-dialogue.js';
import {
  MARTA_HEARTH_BUFF_AMOUNT,
  MARTA_HEARTH_BUFF_NAME,
  MARTA_STEW_COST,
  MARTA_STEW_ITEM,
  buyMartaStew,
  countMartaStew,
} from './marta-stew.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-marta-player',
    name: 'MartaAdventurer',
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

function loadMartaNpc(): HavenNpcLike {
  return parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_innkeeper.yaml'), 'utf8'),
  ) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_innkeeper_day',
  name: 'Олег',
  defaultGreeting: 'Дневная смена.',
  choices: [],
  nodes: {},
};

describe('marta_stew item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads from haven-marta.yaml as a nutritious consumable', () => {
    const item = getItem(MARTA_STEW_ITEM);
    expect(item?.name).toBe('Ночной горшок Марты');
    expect(item?.slot).toBe('consumable');
    expect(item?.survival?.nutrition).toBe(18);
    expect(item?.icon).toBe('/media/assets/item_marta_stew.webp');
  });
});

describe('buyMartaStew', () => {
  it('fails when the player cannot pay', () => {
    const s0 = testSave({ adena: 10 });
    const res = buyMartaStew(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(10);
    expect(res.save.inventory).not.toContain(MARTA_STEW_ITEM);
    expect(res.save.questFlags.buff_sup_marta_hearth_val).toBeUndefined();
    expect(res.message).toContain(String(MARTA_STEW_COST));
  });

  it('gives the stew item and marta_hearth pDef buff', () => {
    const s0 = testSave({ adena: 40 });
    const res = buyMartaStew(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 - MARTA_STEW_COST);
    expect(res.save.inventory).toContain(MARTA_STEW_ITEM);
    expect(countMartaStew(res.save)).toBe(1);
    expect(res.save.questFlags.buff_sup_marta_hearth_val).toBe(MARTA_HEARTH_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_marta_hearth_stat).toBe('pDef');
    expect(res.save.questFlags.buff_sup_marta_hearth_name).toBe(MARTA_HEARTH_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_marta_hearth_until).toBe('string');
    expect(res.message).toContain(MARTA_HEARTH_BUFF_NAME);
  });

  it('is repeatable', () => {
    const first = buyMartaStew(testSave({ adena: 40 }));
    const second = buyMartaStew(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(40 - MARTA_STEW_COST * 2);
    expect(countMartaStew(second.save)).toBe(2);
    expect(second.save.questFlags.buff_sup_marta_hearth_val).toBe(MARTA_HEARTH_BUFF_AMOUNT);
  });
});

describe('marta stew dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateMartaStewDialogue(otherNpc, save)).toBeNull();
    expect(applyMartaStewChoice(otherNpc, save, 'marta_stew')).toBeNull();
  });

  it('includes inn_dice, marta_stew and existing inn choices', () => {
    const npc = loadMartaNpc();
    const dlg = generateMartaStewDialogue(npc, testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'inn_provisions',
        'marta_stew',
        'inn_rest',
        'inn_dice',
        'inn_night',
        'inn_leave',
      ]),
    );
    expect(ids).not.toContain('inn_fish_delivery');
    expect(dlg!.text).toContain('Ночная смена');
  });

  it('shows inn_fish_delivery only while Ulf quest is in flight', () => {
    const npc = loadMartaNpc();
    const idle = generateMartaStewDialogue(npc, testSave())!.choices.map((c) => c.id);
    expect(idle).not.toContain('inn_fish_delivery');

    const active = generateMartaStewDialogue(
      npc,
      testSave({ questFlags: { quest_fish_delivery_active: true } }),
    )!.choices.map((c) => c.id);
    expect(active).toContain('inn_fish_delivery');
  });

  it('injects marta_stew even if YAML omitted it', () => {
    const slim: HavenNpcLike = {
      id: 'town_innkeeper',
      name: 'Хозяйка трактира Марта',
      defaultGreeting: 'Очаг горит.',
      choices: [
        { id: 'inn_rest', label: 'Отдохнуть', flag: '_inn_rest' },
        { id: 'inn_dice', label: 'Кости', flag: '_inn_dice' },
        { id: 'inn_leave', label: 'Уйти', flag: '_inn_done' },
      ],
      nodes: {},
    };
    const ids = generateMartaStewDialogue(slim, testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('marta_stew');
    expect(ids).toContain('inn_dice');
    expect(ids).toContain('inn_rest');
  });

  it('applies marta_stew and returns null for inn_rest and inn_dice', () => {
    const npc = loadMartaNpc();
    const save = testSave({ adena: 40 });

    const stew = applyMartaStewChoice(npc, save, 'marta_stew');
    expect(stew).not.toBeNull();
    expect(stew!.save.inventory).toContain(MARTA_STEW_ITEM);
    expect(stew!.save.questFlags.buff_sup_marta_hearth_val).toBe(MARTA_HEARTH_BUFF_AMOUNT);
    expect(stew!.townMessage).toContain(MARTA_HEARTH_BUFF_NAME);
    expect(stew!.followUp?.choices.map((c) => c.id)).toContain('inn_dice');

    expect(applyMartaStewChoice(npc, save, 'inn_rest')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_dice')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_fish_delivery')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_provisions')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_dice_10')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_dice_25')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_dice_50')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_dice_leave')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_night')).toBeNull();
    expect(applyMartaStewChoice(npc, save, 'inn_leave')).toBeNull();
  });
});
