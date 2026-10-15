import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT, PLAYER_STAMINA_MAX } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  CAPTAIN_DRILL_BUFF_AMOUNT,
  CAPTAIN_DRILL_BUFF_NAME,
  CAPTAIN_DRILL_COST,
  CAPTAIN_DRILL_STAMINA_RESTORE,
  captainDrill,
} from './captain-drill.js';
import { applyCaptainChoice, generateCaptainDialogue } from './captain-drill-dialogue.js';

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

function captainNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_captain.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('town_captain.yaml', () => {
  it('keeps depths/travel flavor and adds captain_drill', () => {
    const npc = captainNpc();
    const ids = npc.choices.map((c) => c.id);
    expect(ids).toContain('captain_drill');
    expect(ids).toContain('captain_grove');
    expect(ids).toContain('captain_travel');
    expect(ids).toContain('captain_depths');
    expect(ids).toContain('captain_bye');
    expect(npc.nodes.depths_brief.choices.map((c) => c.id)).toContain('depths_go');
    expect(npc.choices.find((c) => c.id === 'captain_drill')?.label).toContain('Строевая');
  });
});

describe('captainDrill', () => {
  it('fails when player cannot pay', () => {
    const s0 = testSave({ adena: 11, stamina: 200 });
    const res = captainDrill(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(11);
    expect(res.save.stamina).toBe(200);
    expect(res.save.questFlags.buff_sup_captain_drill_val).toBeUndefined();
    expect(res.message).toContain(String(CAPTAIN_DRILL_COST));
  });

  it('deducts adena, restores stamina toward max, applies pAtk buff', () => {
    const s0 = testSave({ adena: 40, stamina: 100 });
    const res = captainDrill(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 - CAPTAIN_DRILL_COST);
    expect(res.save.stamina).toBe(100 + CAPTAIN_DRILL_STAMINA_RESTORE);
    expect(res.save.questFlags.buff_sup_captain_drill_val).toBe(CAPTAIN_DRILL_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_captain_drill_stat).toBe('pAtk');
    expect(res.save.questFlags.buff_sup_captain_drill_name).toBe(CAPTAIN_DRILL_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_captain_drill_until).toBe('string');
    expect(res.message).toContain('Строевая выправка');
  });

  it('clamps restored stamina to PLAYER_STAMINA_MAX', () => {
    const s0 = testSave({ adena: 12, stamina: PLAYER_STAMINA_MAX - 40 });
    const res = captainDrill(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(0);
    expect(res.save.stamina).toBe(PLAYER_STAMINA_MAX);
  });

  it('keeps stamina at max when already full', () => {
    const s0 = testSave({ adena: 20, stamina: PLAYER_STAMINA_MAX });
    const res = captainDrill(s0);
    expect(res.ok).toBe(true);
    expect(res.save.stamina).toBe(PLAYER_STAMINA_MAX);
    expect(res.save.adena).toBe(8);
  });
});

describe('captain dialogue plugin', () => {
  it('generateCaptainDialogue returns null for other npcs', () => {
    expect(generateCaptainDialogue(captainNpc({ id: 'town_miller' }), testSave())).toBeNull();
  });

  it('keeps yaml choices and adds captain_drill; hides depths until grove/betrayal', () => {
    const dlg = generateCaptainDialogue(captainNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('captain_drill');
    expect(ids).toContain('captain_grove');
    expect(ids).toContain('captain_travel');
    expect(ids).toContain('captain_bye');
    expect(ids).not.toContain('captain_depths');
  });

  it('shows captain_depths after grove complete', () => {
    const dlg = generateCaptainDialogue(
      captainNpc(),
      testSave({ questFlags: { quest_grove_complete: true } }),
    );
    expect(dlg!.choices.map((c) => c.id)).toContain('captain_depths');
  });

  it('shows captain_depths after betrayal complete', () => {
    const dlg = generateCaptainDialogue(
      captainNpc(),
      testSave({ questFlags: { quest_betrayal_complete: true } }),
    );
    expect(dlg!.choices.map((c) => c.id)).toContain('captain_depths');
  });

  it('hides captain_depths when blocks flag is set', () => {
    const dlg = generateCaptainDialogue(
      captainNpc(),
      testSave({
        questFlags: { quest_grove_complete: true, quest_depths_clear_started: true },
      }),
    );
    expect(dlg!.choices.map((c) => c.id)).not.toContain('captain_depths');
  });

  it('applyCaptainChoice returns null for unknown npc', () => {
    expect(
      applyCaptainChoice(testSave(), captainNpc({ id: 'town_miller' }), 'captain_drill'),
    ).toBeNull();
  });

  it('falls through YAML flavor and depths choices', () => {
    const npc = captainNpc();
    const save = testSave();
    expect(applyCaptainChoice(save, npc, 'captain_grove')).toBeNull();
    expect(applyCaptainChoice(save, npc, 'captain_travel')).toBeNull();
    expect(applyCaptainChoice(save, npc, 'captain_depths')).toBeNull();
    expect(applyCaptainChoice(save, npc, 'captain_bye')).toBeNull();
    expect(applyCaptainChoice(save, npc, 'depths_go')).toBeNull();
    expect(applyCaptainChoice(save, npc, 'captain_grove_bye')).toBeNull();
  });

  it('applies drill via dialogue and keeps remaining choices', () => {
    const npc = captainNpc();
    const failed = applyCaptainChoice(testSave({ adena: 0, stamina: 50 }), npc, 'captain_drill');
    expect(failed?.followUp?.text).toContain(String(CAPTAIN_DRILL_COST));
    expect(failed?.save.adena).toBe(0);
    expect(failed?.save.stamina).toBe(50);

    const ok = applyCaptainChoice(testSave({ adena: 30, stamina: 200 }), npc, 'captain_drill');
    expect(ok?.save.adena).toBe(30 - CAPTAIN_DRILL_COST);
    expect(ok?.save.stamina).toBe(200 + CAPTAIN_DRILL_STAMINA_RESTORE);
    expect(ok?.save.questFlags.buff_sup_captain_drill_stat).toBe('pAtk');
    const followIds = ok?.followUp?.choices.map((c) => c.id) ?? [];
    expect(followIds).toContain('captain_drill');
    expect(followIds).toContain('captain_grove');
    expect(followIds).toContain('captain_travel');
    expect(followIds).toContain('captain_bye');
  });
});
