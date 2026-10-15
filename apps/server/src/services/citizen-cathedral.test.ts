import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  applyCitizenCathedralChoice,
  generateCitizenCathedralDialogue,
} from './citizen-cathedral-dialogue.js';
import {
  CATHEDRAL_ALMS_COST,
  CATHEDRAL_CITIZEN_NPC_ID,
  CATHEDRAL_RIBBON_COST,
  PILGRIM_ALMS_BUFF_AMOUNT,
  PILGRIM_ALMS_BUFF_NAME,
  PRAYER_RIBBON_ITEM,
  buyPrayerRibbon,
  countPrayerRibbons,
  givePilgrimAlms,
} from './citizen-cathedral.js';
import { formatCitizenGreeting } from './citizen-rumors.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-cathedral-pilgrim',
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

function loadCathedralNpc(): HavenNpcLike {
  return parseYaml(
    readFileSync(join(contentRoot, 'npcs/haven_citizen_cathedral.yaml'), 'utf8'),
  ) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'haven_citizen_plaza',
  name: 'Горожанин Гавани',
  defaultGreeting: 'Добрый день.',
  choices: [],
  nodes: {},
};

describe('prayer_ribbon item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads from haven-citizen-cathedral.yaml as material', () => {
    const item = getItem(PRAYER_RIBBON_ITEM);
    expect(item?.name).toBe('Молитвенная лента');
    expect(item?.slot).toBe('material');
    expect(item?.icon).toBe('/media/assets/item_prayer_ribbon.webp');
  });
});

describe('buyPrayerRibbon', () => {
  it('fails without enough adena and does not give a ribbon', () => {
    const res = buyPrayerRibbon(testSave({ adena: 3 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(3);
    expect(res.save.inventory).not.toContain(PRAYER_RIBBON_ITEM);
    expect(res.message).toContain(String(CATHEDRAL_RIBBON_COST));
  });

  it('sells prayer_ribbon for 7 adena and is repeatable', () => {
    const first = buyPrayerRibbon(testSave({ adena: 20 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(20 - CATHEDRAL_RIBBON_COST);
    expect(first.save.inventory).toContain(PRAYER_RIBBON_ITEM);
    expect(countPrayerRibbons(first.save)).toBe(1);

    const second = buyPrayerRibbon(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(20 - CATHEDRAL_RIBBON_COST * 2);
    expect(countPrayerRibbons(second.save)).toBe(2);
  });
});

describe('givePilgrimAlms', () => {
  it('fails without enough adena and does not apply pilgrim_alms', () => {
    const res = givePilgrimAlms(testSave({ adena: 4 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(4);
    expect(res.save.questFlags.buff_sup_pilgrim_alms_val).toBeUndefined();
    expect(res.message).toContain(String(CATHEDRAL_ALMS_COST));
  });

  it('charges 10 adena and applies pilgrim_alms mDef buff', () => {
    const res = givePilgrimAlms(testSave({ adena: 25 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(25 - CATHEDRAL_ALMS_COST);
    expect(res.save.questFlags.buff_sup_pilgrim_alms_val).toBe(PILGRIM_ALMS_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_pilgrim_alms_stat).toBe('mDef');
    expect(res.save.questFlags.buff_sup_pilgrim_alms_name).toBe(PILGRIM_ALMS_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_pilgrim_alms_until).toBe('string');
    expect(res.message).toContain(PILGRIM_ALMS_BUFF_NAME);
  });

  it('is repeatable and refreshes the buff', () => {
    const first = givePilgrimAlms(testSave({ adena: 30 }));
    const second = givePilgrimAlms(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(30 - CATHEDRAL_ALMS_COST * 2);
    expect(second.save.questFlags.buff_sup_pilgrim_alms_val).toBe(PILGRIM_ALMS_BUFF_AMOUNT);
  });
});

describe('citizen cathedral dialogue generate/apply', () => {
  it('generateCitizenCathedralDialogue returns null for other npcs', () => {
    const save = testSave();
    expect(generateCitizenCathedralDialogue(otherNpc, save)).toBeNull();
    expect(generateCitizenCathedralDialogue({ ...loadCathedralNpc(), id: 'town_priest' }, save)).toBeNull();
    expect(applyCitizenCathedralChoice(otherNpc, save, 'cathedral_ribbon')).toBeNull();
  });

  it('shows ribbon, alms and citizen flavor choices', () => {
    const dlg = generateCitizenCathedralDialogue(loadCathedralNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('cathedral_ribbon');
    expect(ids).toContain('cathedral_pilgrim_alms');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
    expect(ids).not.toContain('cassius_candle');
    expect(ids.some((id) => id.startsWith('priest_'))).toBe(false);
  });

  it('injects mechanic extras even if YAML omitted them', () => {
    const slim: HavenNpcLike = {
      id: CATHEDRAL_CITIZEN_NPC_ID,
      name: 'Паломник Гавани',
      defaultGreeting: 'Мир тебе, путник.',
      choices: [
        { id: 'citizen_rumors', label: 'Слухи', flag: '_cit_rumors' },
        { id: 'citizen_leave', label: 'Уйти', flag: '_cit_done' },
      ],
      nodes: {},
    };
    const ids = generateCitizenCathedralDialogue(slim, testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('cathedral_ribbon');
    expect(ids).toContain('cathedral_pilgrim_alms');
    expect(ids).toContain('citizen_rumors');
  });

  it('greets via formatCitizenGreeting', () => {
    const npc = loadCathedralNpc();
    const save = testSave({ karma: 5 });
    const dlg = generateCitizenCathedralDialogue(npc, save);
    const expected = formatCitizenGreeting(npc.defaultGreeting, save);
    expect(dlg!.text).toBe(expected.text);
    expect(dlg!.text).toContain(npc.defaultGreeting.trim());
  });

  it('apply returns null for citizen_rumors, citizen_advice, citizen_leave', () => {
    const npc = loadCathedralNpc();
    const save = testSave();
    expect(applyCitizenCathedralChoice(npc, save, 'citizen_rumors')).toBeNull();
    expect(applyCitizenCathedralChoice(npc, save, 'citizen_advice')).toBeNull();
    expect(applyCitizenCathedralChoice(npc, save, 'citizen_leave')).toBeNull();
  });

  it('applies ribbon and alms through applyCitizenCathedralChoice', () => {
    const npc = loadCathedralNpc();
    const ribbon = applyCitizenCathedralChoice(npc, testSave({ adena: 40 }), 'cathedral_ribbon');
    expect(ribbon).not.toBeNull();
    expect(ribbon!.save.inventory).toContain(PRAYER_RIBBON_ITEM);
    expect(ribbon!.save.adena).toBe(40 - CATHEDRAL_RIBBON_COST);
    expect(ribbon!.followUp?.choices.map((c) => c.id)).toContain('cathedral_pilgrim_alms');

    const alms = applyCitizenCathedralChoice(npc, testSave({ adena: 40 }), 'cathedral_pilgrim_alms');
    expect(alms).not.toBeNull();
    expect(alms!.save.questFlags.buff_sup_pilgrim_alms_val).toBe(PILGRIM_ALMS_BUFF_AMOUNT);
    expect(alms!.followUp?.text).toContain(PILGRIM_ALMS_BUFF_NAME);
    expect(alms!.followUp?.choices.map((c) => c.id)).toContain('cathedral_ribbon');
  });
});
