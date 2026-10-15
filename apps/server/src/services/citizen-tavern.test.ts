import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  TAVERN_CHEER_BUFF_AMOUNT,
  TAVERN_CHEER_BUFF_NAME,
  TAVERN_ROUND_COST,
  tavernRound,
} from './citizen-tavern.js';
import {
  applyCitizenTavernChoice,
  generateCitizenTavernDialogue,
} from './citizen-tavern-dialogue.js';

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

function tavernNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/haven_citizen_tavern.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('haven_citizen_tavern.yaml', () => {
  it('keeps rumors/advice/leave and adds tavern_round', () => {
    const npc = tavernNpc();
    const ids = npc.choices.map((c) => c.id);
    expect(ids).toContain('tavern_round');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
    expect(npc.choices.find((c) => c.id === 'tavern_round')?.label).toBe(
      'Поставить круг (9 адены)',
    );
  });
});

describe('tavernRound', () => {
  it('fails when player cannot pay', () => {
    const s0 = testSave({ adena: 8 });
    const res = tavernRound(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(8);
    expect(res.save.questFlags.buff_sup_tavern_cheer_val).toBeUndefined();
    expect(res.save.inventory).toEqual([]);
    expect(res.message).toContain(String(TAVERN_ROUND_COST));
  });

  it('deducts adena and applies attackSpeed buff flags', () => {
    const s0 = testSave({ adena: 20 });
    const res = tavernRound(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - TAVERN_ROUND_COST);
    expect(res.save.inventory).toEqual([]);
    expect(res.save.questFlags.buff_sup_tavern_cheer_val).toBe(TAVERN_CHEER_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_tavern_cheer_stat).toBe('attackSpeed');
    expect(res.save.questFlags.buff_sup_tavern_cheer_name).toBe(TAVERN_CHEER_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_tavern_cheer_until).toBe('string');
    expect(res.message).toContain('Застолье');
  });

  it('is repeatable and overwrites the cheer timer', () => {
    const first = tavernRound(testSave({ adena: 30 }));
    expect(first.ok).toBe(true);
    const second = tavernRound(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(30 - TAVERN_ROUND_COST * 2);
    expect(second.save.questFlags.buff_sup_tavern_cheer_stat).toBe('attackSpeed');
    expect(second.save.questFlags.buff_sup_tavern_cheer_val).toBe(TAVERN_CHEER_BUFF_AMOUNT);
  });
});

describe('citizen tavern dialogue plugin', () => {
  it('generateCitizenTavernDialogue returns null for other npcs', () => {
    expect(
      generateCitizenTavernDialogue(tavernNpc({ id: 'haven_citizen_market' }), testSave()),
    ).toBeNull();
  });

  it('generate includes tavern_round and YAML flavor choices', () => {
    const dlg = generateCitizenTavernDialogue(tavernNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('tavern_round');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
  });

  it('prefixes greeting via formatCitizenGreeting on deed recognition', () => {
    const dlg = generateCitizenTavernDialogue(
      tavernNpc(),
      testSave({ questFlags: { quest_hq_lab_complete: true } }),
    );
    expect(dlg!.text).toContain('запустил биополе в лаборатории Штаба');
    expect(dlg!.text).toContain('присаживайся к теплу');
  });

  it('applyCitizenTavernChoice returns null for unknown npc', () => {
    expect(
      applyCitizenTavernChoice(
        tavernNpc({ id: 'haven_citizen_plaza' }),
        testSave(),
        'tavern_round',
      ),
    ).toBeNull();
  });

  it('apply returns null for rumors, advice and leave', () => {
    const npc = tavernNpc();
    const save = testSave();
    expect(applyCitizenTavernChoice(npc, save, 'citizen_rumors')).toBeNull();
    expect(applyCitizenTavernChoice(npc, save, 'citizen_advice')).toBeNull();
    expect(applyCitizenTavernChoice(npc, save, 'citizen_leave')).toBeNull();
  });

  it('applies tavern_round via dialogue and keeps remaining choices', () => {
    const npc = tavernNpc();
    const failed = applyCitizenTavernChoice(npc, testSave({ adena: 0 }), 'tavern_round');
    expect(failed?.followUp?.text).toContain(String(TAVERN_ROUND_COST));
    expect(failed?.save.adena).toBe(0);
    expect(failed?.save.questFlags.buff_sup_tavern_cheer_val).toBeUndefined();

    const ok = applyCitizenTavernChoice(npc, testSave({ adena: 30 }), 'tavern_round');
    expect(ok?.save.adena).toBe(30 - TAVERN_ROUND_COST);
    expect(ok?.save.questFlags.buff_sup_tavern_cheer_stat).toBe('attackSpeed');
    expect(ok?.save.questFlags.buff_sup_tavern_cheer_val).toBe(TAVERN_CHEER_BUFF_AMOUNT);
    const followIds = ok?.followUp?.choices.map((c) => c.id) ?? [];
    expect(followIds).toContain('tavern_round');
    expect(followIds).toContain('citizen_rumors');
    expect(followIds).toContain('citizen_advice');
    expect(followIds).toContain('citizen_leave');
  });
});
