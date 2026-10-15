import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  PLAZA_CHARM_COMPLETE_FLAG,
  PLAZA_CHARM_COST,
  PLAZA_CHARM_ITEM,
  PLAZA_COIN_COST,
  PLAZA_FOUNTAIN_BUFF_AMOUNT,
  PLAZA_FOUNTAIN_BUFF_NAME,
  PLAZA_NPC_ID,
  buyPlazaCharm,
  tossPlazaCoin,
} from './citizen-plaza.js';
import {
  applyCitizenPlazaChoice,
  generateCitizenPlazaDialogue,
} from './citizen-plaza-dialogue.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-plaza-player',
    name: 'PlazaAdventurer',
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

function plazaNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/haven_citizen_plaza.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

beforeAll(() => {
  clearItemsCache();
});

describe('plaza charm item', () => {
  it('loads plaza_charm from haven-citizen-plaza.yaml', () => {
    expect(getItem(PLAZA_CHARM_ITEM)?.name).toBe('Талисман площади');
    expect(getItem(PLAZA_CHARM_ITEM)?.slot).toBe('material');
    expect(getItem(PLAZA_CHARM_ITEM)?.icon).toBe('/media/assets/item_plaza_charm.webp');
  });
});

describe('tossPlazaCoin', () => {
  it('fails without enough adena', () => {
    const res = tossPlazaCoin(testSave({ adena: 2 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(2);
    expect(res.save.questFlags.buff_sup_plaza_fountain_val).toBeUndefined();
    expect(res.message).toContain('3');
  });

  it('applies plaza_fountain mDef buff and is repeatable', () => {
    const first = tossPlazaCoin(testSave({ adena: 10 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(10 - PLAZA_COIN_COST);
    expect(first.save.questFlags.buff_sup_plaza_fountain_val).toBe(PLAZA_FOUNTAIN_BUFF_AMOUNT);
    expect(first.save.questFlags.buff_sup_plaza_fountain_name).toBe(PLAZA_FOUNTAIN_BUFF_NAME);
    expect(first.save.questFlags.buff_sup_plaza_fountain_stat).toBe('mDef');
    expect(first.message).toContain('Монета в фонтан');

    const second = tossPlazaCoin(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(10 - PLAZA_COIN_COST * 2);
    expect(second.save.questFlags.buff_sup_plaza_fountain_val).toBe(PLAZA_FOUNTAIN_BUFF_AMOUNT);
  });
});

describe('buyPlazaCharm', () => {
  it('fails without enough adena', () => {
    const res = buyPlazaCharm(testSave({ adena: 11 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(11);
    expect(res.save.inventory).toEqual([]);
    expect(res.save.questFlags[PLAZA_CHARM_COMPLETE_FLAG]).toBeFalsy();
  });

  it('gives plaza_charm once and rejects a second buy', () => {
    const first = buyPlazaCharm(testSave({ adena: 20 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(20 - PLAZA_CHARM_COST);
    expect(first.save.inventory).toContain(PLAZA_CHARM_ITEM);
    expect(first.save.questFlags[PLAZA_CHARM_COMPLETE_FLAG]).toBe(true);

    const second = buyPlazaCharm(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.adena).toBe(first.save.adena);
    expect(second.save.inventory.filter((id) => id === PLAZA_CHARM_ITEM)).toHaveLength(1);
    expect(second.message).toContain('уже');
  });
});

describe('citizen plaza dialogue plugin', () => {
  it('generateCitizenPlazaDialogue returns null for other npcs', () => {
    expect(generateCitizenPlazaDialogue(plazaNpc({ id: 'haven_citizen_market' }), testSave())).toBeNull();
  });

  it('generate includes plaza_coin and greeting via formatCitizenGreeting', () => {
    const dlg = generateCitizenPlazaDialogue(plazaNpc(), testSave());
    expect(dlg).not.toBeNull();
    expect(dlg!.npcId).toBe(PLAZA_NPC_ID);
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('plaza_coin');
    expect(ids).toContain('plaza_charm');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
    expect(dlg!.text).toContain('фонтана');

    const recognized = generateCitizenPlazaDialogue(
      plazaNpc(),
      testSave({ questFlags: { quest_hq_lab_complete: true } }),
    );
    expect(recognized!.text).toContain('лаборатории');
    expect(recognized!.text).toContain('фонтана');
  });

  it('hides plaza_charm after quest_plaza_charm_complete', () => {
    const dlg = generateCitizenPlazaDialogue(
      plazaNpc(),
      testSave({ questFlags: { [PLAZA_CHARM_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('plaza_coin');
    expect(ids).not.toContain('plaza_charm');
  });

  it('apply returns null for rumors, advice and leave', () => {
    const npc = plazaNpc();
    const save = testSave();
    expect(applyCitizenPlazaChoice(npc, save, 'citizen_rumors')).toBeNull();
    expect(applyCitizenPlazaChoice(npc, save, 'citizen_advice')).toBeNull();
    expect(applyCitizenPlazaChoice(npc, save, 'citizen_leave')).toBeNull();
  });

  it('apply returns null for unknown npc', () => {
    expect(
      applyCitizenPlazaChoice(plazaNpc({ id: 'haven_citizen_market' }), testSave(), 'plaza_coin'),
    ).toBeNull();
  });

  it('applies plaza_coin via dialogue and keeps remaining choices', () => {
    const npc = plazaNpc();
    const failed = applyCitizenPlazaChoice(npc, testSave({ adena: 0 }), 'plaza_coin');
    expect(failed?.followUp?.text).toContain('адены');
    expect(failed?.save.adena).toBe(0);

    const tossed = applyCitizenPlazaChoice(npc, testSave({ adena: 8 }), 'plaza_coin');
    expect(tossed?.save.adena).toBe(8 - PLAZA_COIN_COST);
    expect(tossed?.save.questFlags.buff_sup_plaza_fountain_val).toBe(PLAZA_FOUNTAIN_BUFF_AMOUNT);
    expect(tossed?.followUp?.choices.map((c) => c.id)).toContain('plaza_coin');
    expect(tossed?.followUp?.choices.map((c) => c.id)).toContain('plaza_charm');
  });

  it('applies plaza_charm once through applyCitizenPlazaChoice', () => {
    const npc = plazaNpc();
    const bought = applyCitizenPlazaChoice(npc, testSave({ adena: 15 }), 'plaza_charm');
    expect(bought?.save.questFlags[PLAZA_CHARM_COMPLETE_FLAG]).toBe(true);
    expect(bought?.save.inventory).toContain(PLAZA_CHARM_ITEM);
    expect(bought?.followUp?.choices.map((c) => c.id)).toContain('plaza_coin');
    expect(bought?.followUp?.choices.map((c) => c.id)).not.toContain('plaza_charm');

    const again = applyCitizenPlazaChoice(npc, bought!.save, 'plaza_charm');
    expect(again?.save.adena).toBe(bought!.save.adena);
    expect(again?.followUp?.text).toContain('уже');
  });
});
