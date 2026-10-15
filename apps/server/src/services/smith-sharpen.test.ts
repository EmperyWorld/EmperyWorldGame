import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { applySmithChoice, generateSmithDialogue } from './smith-sharpen-dialogue.js';
import {
  FORGE_SHARPEN_COST,
  FORGE_WHETSTONE_COST,
  SMITH_EDGE_BUFF_AMOUNT,
  SMITH_EDGE_BUFF_NAME,
  SMITH_WHETSTONE_ITEM,
  countSmithWhetstones,
  smithBuyWhetstone,
  smithSharpen,
} from './smith-sharpen.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-smith-player',
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

function loadSmithNpc(): HavenNpcLike {
  return parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_blacksmith.yaml'), 'utf8'),
  ) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_priest',
  name: 'Отец Кассий',
  defaultGreeting: 'Мир тебе.',
  choices: [],
  nodes: {},
};

describe('smith_whetstone item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads smith_whetstone from haven-smith.yaml', () => {
    const item = getItem(SMITH_WHETSTONE_ITEM);
    expect(item?.name).toBe('Оселок Гарольда');
    expect(item?.slot).toBe('material');
    expect(item?.rarity).toBe('common');
    expect(item?.weight).toBe(0.15);
    expect(item?.icon).toBe('/media/assets/item_smith_whetstone.webp');
  });
});

describe('smith forge services (town_blacksmith)', () => {
  it('rejects sharpen and whetstone when player cannot pay', () => {
    const s0 = testSave({ adena: 5 });
    const edge = smithSharpen(s0);
    expect(edge.ok).toBe(false);
    expect(edge.save.adena).toBe(5);
    expect(edge.save.questFlags.buff_sup_smith_edge_val).toBeUndefined();
    expect(edge.message).toContain(String(FORGE_SHARPEN_COST));

    const stone = smithBuyWhetstone(s0);
    expect(stone.ok).toBe(false);
    expect(stone.save.adena).toBe(5);
    expect(stone.save.inventory).not.toContain(SMITH_WHETSTONE_ITEM);
    expect(stone.message).toContain(String(FORGE_WHETSTONE_COST));
  });

  it('applies smith_edge buff flags and deducts 15 adena', () => {
    const res = smithSharpen(testSave({ adena: 40 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 - FORGE_SHARPEN_COST);
    expect(res.save.questFlags.buff_sup_smith_edge_val).toBe(SMITH_EDGE_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_smith_edge_name).toBe(SMITH_EDGE_BUFF_NAME);
    expect(res.save.questFlags.buff_sup_smith_edge_stat).toBe('pAtk');
    expect(typeof res.save.questFlags.buff_sup_smith_edge_until).toBe('string');
    expect(res.message).toContain(SMITH_EDGE_BUFF_NAME);
  });

  it('puts smith_whetstone in the bag and is repeatable', () => {
    const first = smithBuyWhetstone(testSave({ adena: 40 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(40 - FORGE_WHETSTONE_COST);
    expect(first.save.inventory).toContain(SMITH_WHETSTONE_ITEM);
    expect(countSmithWhetstones(first.save)).toBe(1);

    const second = smithBuyWhetstone(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(40 - FORGE_WHETSTONE_COST * 2);
    expect(countSmithWhetstones(second.save)).toBe(2);
  });

  it('sharpen is repeatable', () => {
    const first = smithSharpen(testSave({ adena: 40 }));
    const second = smithSharpen(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(40 - FORGE_SHARPEN_COST * 2);
    expect(second.save.questFlags.buff_sup_smith_edge_val).toBe(SMITH_EDGE_BUFF_AMOUNT);
  });
});

describe('smith dialogue plugin', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateSmithDialogue(otherNpc, save)).toBeNull();
    expect(applySmithChoice(otherNpc, save, 'forge_sharpen')).toBeNull();
  });

  it('generate includes forge_armor and the new forge extras', () => {
    const dlg = generateSmithDialogue(loadSmithNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('forge_armor');
    expect(ids).toContain('forge_open');
    expect(ids).toContain('forge_sharpen');
    expect(ids).toContain('forge_whetstone');
    expect(ids).toContain('forge_leave');
  });

  it('greeting mentions the hunt after quest_board_bounty_complete', () => {
    const dlg = generateSmithDialogue(
      loadSmithNpc(),
      testSave({ questFlags: { quest_board_bounty_complete: true } }),
    );
    expect(dlg?.text).toContain('чудовищ');
    expect(dlg?.text).toContain('лезвие');
  });

  it('injects extras even if YAML omitted them', () => {
    const slim: HavenNpcLike = {
      id: 'town_blacksmith',
      name: 'Кузнец Гарольд',
      defaultGreeting: 'Горн горячий.',
      choices: [
        { id: 'forge_armor', label: 'Купить доспехи', flag: '_forge_armor' },
        { id: 'forge_open', label: 'К кузнице', flag: '_forge_open' },
        { id: 'forge_leave', label: 'Уйти', flag: '_forge_done' },
      ],
      nodes: {},
    };
    const ids = generateSmithDialogue(slim, testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('forge_armor');
    expect(ids).toContain('forge_sharpen');
    expect(ids).toContain('forge_whetstone');
    expect(ids).toContain('forge_open');
  });

  it('apply returns null for forge_open, forge_armor, forge_leave', () => {
    const npc = loadSmithNpc();
    const save = testSave();
    expect(applySmithChoice(npc, save, 'forge_open')).toBeNull();
    expect(applySmithChoice(npc, save, 'forge_armor')).toBeNull();
    expect(applySmithChoice(npc, save, 'forge_leave')).toBeNull();
  });

  it('applies sharpen and whetstone through applySmithChoice(npc, save, id)', () => {
    const npc = loadSmithNpc();
    const save = testSave({ adena: 40 });

    const edge = applySmithChoice(npc, save, 'forge_sharpen');
    expect(edge).not.toBeNull();
    expect(edge!.save.questFlags.buff_sup_smith_edge_val).toBe(SMITH_EDGE_BUFF_AMOUNT);
    expect(edge!.followUp?.text).toContain(SMITH_EDGE_BUFF_NAME);
    expect(edge!.followUp?.choices.map((c) => c.id)).toContain('forge_armor');

    const stone = applySmithChoice(npc, save, 'forge_whetstone');
    expect(stone).not.toBeNull();
    expect(stone!.save.inventory).toContain(SMITH_WHETSTONE_ITEM);
    expect(stone!.townMessage).toContain('оселок');
  });
});
