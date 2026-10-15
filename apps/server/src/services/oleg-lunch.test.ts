import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { applyOlegLunchChoice, generateOlegLunchDialogue } from './oleg-lunch-dialogue.js';
import {
  OLEG_BROTH_ITEM,
  OLEG_LUNCH_BUFF_AMOUNT,
  OLEG_LUNCH_BUFF_NAME,
  OLEG_LUNCH_COST,
  OLEG_NPC_ID,
  serveOlegLunch,
} from './oleg-lunch.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-oleg-player',
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

function loadOlegNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_innkeeper_day.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

const otherNpc: HavenNpcLike = {
  id: 'town_innkeeper',
  name: 'Трактирщица Марта',
  defaultGreeting: 'Ночная смена.',
  choices: [],
  nodes: {},
};

describe('oleg_broth item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads from haven-oleg.yaml as a consumable with nutrition 14', () => {
    const item = getItem(OLEG_BROTH_ITEM);
    expect(item?.name).toBe('Бульон Олега');
    expect(item?.slot).toBe('consumable');
    expect(item?.survival?.nutrition).toBe(14);
    expect(item?.icon).toBe('/media/assets/item_oleg_broth.webp');
  });
});

describe('serveOlegLunch', () => {
  it('fails when the player cannot pay', () => {
    const s0 = testSave({ adena: 5 });
    const res = serveOlegLunch(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.inventory).not.toContain(OLEG_BROTH_ITEM);
    expect(res.save.questFlags.buff_sup_oleg_lunch_val).toBeUndefined();
    expect(res.message).toContain(String(OLEG_LUNCH_COST));
  });

  it('gives oleg_broth and oleg_lunch mDef buff', () => {
    const res = serveOlegLunch(testSave({ adena: 40 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 - OLEG_LUNCH_COST);
    expect(res.save.inventory).toContain(OLEG_BROTH_ITEM);
    expect(res.save.questFlags.buff_sup_oleg_lunch_val).toBe(OLEG_LUNCH_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_oleg_lunch_stat).toBe('mDef');
    expect(res.save.questFlags.buff_sup_oleg_lunch_name).toBe(OLEG_LUNCH_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_oleg_lunch_until).toBe('string');
    expect(res.message).toContain(OLEG_LUNCH_BUFF_NAME);
  });

  it('is repeatable', () => {
    const first = serveOlegLunch(testSave({ adena: 30 }));
    const second = serveOlegLunch(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(30 - OLEG_LUNCH_COST * 2);
    expect(second.save.inventory.filter((id) => id === OLEG_BROTH_ITEM)).toHaveLength(2);
    expect(second.save.questFlags.buff_sup_oleg_lunch_val).toBe(OLEG_LUNCH_BUFF_AMOUNT);
  });
});

describe('oleg lunch dialogue generate/apply', () => {
  it('returns null for Marta and other npcs', () => {
    const save = testSave();
    expect(generateOlegLunchDialogue(otherNpc, save)).toBeNull();
    expect(applyOlegLunchChoice(otherNpc, save, 'oleg_lunch')).toBeNull();
    expect(generateOlegLunchDialogue(loadOlegNpc({ id: 'town_miller' }), save)).toBeNull();
  });

  it('generate includes inn_rest and oleg_lunch', () => {
    const dlg = generateOlegLunchDialogue(loadOlegNpc(), testSave());
    expect(dlg).not.toBeNull();
    expect(dlg!.npcId).toBe(OLEG_NPC_ID);
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('inn_rest');
    expect(ids).toContain('oleg_lunch');
    expect(ids).toContain('inn_provisions');
    expect(ids).toContain('inn_dice');
    expect(ids).toContain('oleg_news');
    expect(ids).toContain('inn_leave');
    expect(ids).not.toContain('marta_stew');
  });

  it('hides inn_fish_delivery until Ulf quest is active', () => {
    const npc = loadOlegNpc();
    const idle = generateOlegLunchDialogue(npc, testSave())!.choices.map((c) => c.id);
    expect(idle).not.toContain('inn_fish_delivery');
    const active = generateOlegLunchDialogue(
      npc,
      testSave({ questFlags: { quest_fish_delivery_active: true } }),
    )!.choices.map((c) => c.id);
    expect(active).toContain('inn_fish_delivery');
  });

  it('injects oleg_lunch even if YAML omitted it', () => {
    const slim: HavenNpcLike = {
      id: OLEG_NPC_ID,
      name: 'Трактирщик Олег',
      defaultGreeting: 'Дневная смена.',
      choices: [
        { id: 'inn_provisions', label: 'Купить питьё', flag: '_inn_provisions' },
        { id: 'inn_rest', label: 'Отдохнуть', flag: '_inn_rest' },
        { id: 'inn_leave', label: 'Уйти', flag: '_inn_done' },
      ],
      nodes: {},
    };
    const ids = generateOlegLunchDialogue(slim, testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('oleg_lunch');
    expect(ids).toContain('oleg_news');
    expect(ids).toContain('inn_rest');
  });

  it('apply returns null for inn_provisions and other inn actions', () => {
    const npc = loadOlegNpc();
    const save = testSave();
    expect(applyOlegLunchChoice(npc, save, 'inn_provisions')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_fish_delivery')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_rest')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_dice')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_dice_10')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_dice_25')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_dice_50')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_dice_leave')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_day')).toBeNull();
    expect(applyOlegLunchChoice(npc, save, 'inn_leave')).toBeNull();
  });

  it('applies lunch through dialogue: cost fail, then item+buff', () => {
    const npc = loadOlegNpc();
    const poor = applyOlegLunchChoice(npc, testSave({ adena: 0 }), 'oleg_lunch');
    expect(poor).not.toBeNull();
    expect(poor!.save.adena).toBe(0);
    expect(poor!.save.inventory).not.toContain(OLEG_BROTH_ITEM);
    expect(poor!.followUp?.text).toContain(String(OLEG_LUNCH_COST));

    const ok = applyOlegLunchChoice(npc, testSave({ adena: 20 }), 'oleg_lunch');
    expect(ok).not.toBeNull();
    expect(ok!.save.adena).toBe(20 - OLEG_LUNCH_COST);
    expect(ok!.save.inventory).toContain(OLEG_BROTH_ITEM);
    expect(ok!.save.questFlags.buff_sup_oleg_lunch_val).toBe(OLEG_LUNCH_BUFF_AMOUNT);
    expect(ok!.save.questFlags.buff_sup_oleg_lunch_stat).toBe('mDef');
    expect(ok!.followUp?.choices.map((c) => c.id)).toContain('inn_rest');
    expect(ok!.followUp?.choices.map((c) => c.id)).toContain('oleg_lunch');
  });

  it('oleg_news is free flavor followUp without save mutation', () => {
    const npc = loadOlegNpc();
    const save = testSave({ adena: 44, inventory: ['bread_loaf'] });
    const news = applyOlegLunchChoice(npc, save, 'oleg_news');
    expect(news).not.toBeNull();
    expect(news!.save).toBe(save);
    expect(news!.save.adena).toBe(44);
    expect(news!.followUp?.text).toMatch(/дн/i);
    expect(news!.followUp?.choices.map((c) => c.id)).toContain('inn_rest');
  });
});
