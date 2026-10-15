import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import {
  BARD_ENCORE_BUFF_AMOUNT,
  BARD_ENCORE_BUFF_NAME,
  BARD_ENCORE_COST,
  requestBardEncore,
} from './bard-encore.js';
import {
  applyBardEncoreChoice,
  BARD_ENCORE_NPC_ID,
  generateBardEncoreDialogue,
} from './bard-encore-dialogue.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-bard-player',
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

function loadBardNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/stage_bard.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

const otherNpc: HavenNpcLike = {
  id: 'town_priest',
  name: 'Отец Кассий',
  defaultGreeting: 'Мир тебе.',
  choices: [],
  nodes: {},
};

afterEach(()=>vi.restoreAllMocks());

describe('requestBardEncore', () => {
  it('fails when the player cannot pay', () => {
    const s0 = testSave({ adena: 7 });
    const res = requestBardEncore(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(7);
    expect(res.save.questFlags.buff_sup_kai_encore_val).toBeUndefined();
    expect(res.message).toContain(String(BARD_ENCORE_COST));
  });

  it('applies kai_encore critRate buff flags and deducts adena', () => {
    const s0 = testSave({ adena: 20 });
    const res = requestBardEncore(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - BARD_ENCORE_COST);
    expect(res.save.questFlags.buff_sup_kai_encore_val).toBe(BARD_ENCORE_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_kai_encore_stat).toBe('critRate');
    expect(res.save.questFlags.buff_sup_kai_encore_name).toBe(BARD_ENCORE_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_kai_encore_until).toBe('string');
    expect(res.save.questFlags.buff_sup_bard_inspiration_val).toBeUndefined();
    expect(res.save.questFlags.buff_sup_bard_tempo_val).toBeUndefined();
    expect(res.save.questFlags.buff_sup_bard_harmony_val).toBeUndefined();
    expect(res.message).toContain(BARD_ENCORE_BUFF_NAME);
  });

  it('is repeatable and overwrites the encore timer', () => {
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.UTC(2026,0,1,12));
    const first = requestBardEncore(testSave({ adena: 20 }));
    const firstUntil = first.save.questFlags.buff_sup_kai_encore_until;
    clock.mockReturnValue(Date.UTC(2026,0,1,12)+1000);
    const second = requestBardEncore(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(20 - BARD_ENCORE_COST * 2);
    expect(second.save.questFlags.buff_sup_kai_encore_val).toBe(BARD_ENCORE_BUFF_AMOUNT);
    expect(typeof second.save.questFlags.buff_sup_kai_encore_until).toBe('string');
    expect(Date.parse(String(second.save.questFlags.buff_sup_kai_encore_until))-Date.parse(String(firstUntil))).toBe(1000);
  });
});

describe('bard encore dialogue generate/apply', () => {
  it('generateBardEncoreDialogue returns null for other npcs', () => {
    expect(generateBardEncoreDialogue(otherNpc, testSave())).toBeNull();
    expect(applyBardEncoreChoice(otherNpc, testSave(), 'bard_encore')).toBeNull();
  });

  it('generate includes bard_buff and bard_encore and keeps node_stories', () => {
    const npc = loadBardNpc();
    expect(npc.id).toBe(BARD_ENCORE_NPC_ID);
    expect(npc.nodes.node_stories).toBeDefined();

    const dlg = generateBardEncoreDialogue(npc, testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('bard_buff');
    expect(ids).toContain('bard_encore');
    expect(ids).toContain('bard_stories');
    expect(ids).toContain('bard_song_custom');
    expect(ids).toContain('bard_leave');
    expect(dlg!.choices.find((c) => c.id === 'bard_encore')?.label).toContain(
      String(BARD_ENCORE_COST),
    );
  });

  it('apply returns null for bard_buff so existing inspiration stays with the parent', () => {
    const npc = loadBardNpc();
    const save = testSave({ adena: 20 });
    expect(applyBardEncoreChoice(npc, save, 'bard_buff')).toBeNull();
    expect(applyBardEncoreChoice(npc, save, 'bard_stories')).toBeNull();
    expect(applyBardEncoreChoice(npc, save, 'bard_song_custom')).toBeNull();
    expect(applyBardEncoreChoice(npc, save, 'bard_leave')).toBeNull();
  });

  it('applies encore through applyBardEncoreChoice', () => {
    const npc = loadBardNpc();
    const failed = applyBardEncoreChoice(npc, testSave({ adena: 3 }), 'bard_encore');
    expect(failed?.followUp?.text).toContain(String(BARD_ENCORE_COST));
    expect(failed?.save.adena).toBe(3);
    expect(failed?.save.questFlags.buff_sup_kai_encore_val).toBeUndefined();

    const paid = applyBardEncoreChoice(npc, testSave({ adena: 20 }), 'bard_encore');
    expect(paid).not.toBeNull();
    expect(paid!.save.adena).toBe(20 - BARD_ENCORE_COST);
    expect(paid!.save.questFlags.buff_sup_kai_encore_val).toBe(BARD_ENCORE_BUFF_AMOUNT);
    expect(paid!.followUp?.choices.map((c) => c.id)).toContain('bard_buff');
    expect(paid!.followUp?.choices.map((c) => c.id)).toContain('bard_encore');
  });
});
