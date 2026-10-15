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
  CITIZEN_GUARD_NPC_ID,
  MILITIA_DRILL_BUFF_AMOUNT,
  MILITIA_DRILL_BUFF_ID,
  MILITIA_DRILL_BUFF_NAME,
  MILITIA_DRILL_STAMINA_COST,
  MILITIA_WATCH_COMPLETE_FLAG,
  MILITIA_WATCH_REWARD_ADENA,
  militiaDrill,
  militiaWatch,
} from './citizen-militia.js';
import {
  applyCitizenMilitiaChoice,
  generateCitizenMilitiaDialogue,
} from './citizen-militia-dialogue.js';

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

function guardCitizenNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/haven_citizen_guard.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('haven_citizen_guard.yaml', () => {
  it('keeps citizen flavor and adds militia_drill / militia_watch', () => {
    const npc = guardCitizenNpc();
    expect(npc.id).toBe(CITIZEN_GUARD_NPC_ID);
    const ids = npc.choices.map((c) => c.id);
    expect(ids).toContain('militia_drill');
    expect(ids).toContain('militia_watch');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
    expect(npc.choices.find((c) => c.id === 'militia_watch')?.blocks).toContain(
      MILITIA_WATCH_COMPLETE_FLAG,
    );
  });
});

describe('militiaDrill', () => {
  it('fails when stamina is below 70 and does not apply buff', () => {
    const s0 = testSave({ stamina: MILITIA_DRILL_STAMINA_COST - 1 });
    const res = militiaDrill(s0);
    expect(res.ok).toBe(false);
    expect(res.save.stamina).toBe(MILITIA_DRILL_STAMINA_COST - 1);
    expect(res.save.questFlags.buff_sup_militia_drill_val).toBeUndefined();
    expect(res.save.questFlags.buff_sup_captain_drill_val).toBeUndefined();
    expect(res.message).toContain(String(MILITIA_DRILL_STAMINA_COST));
  });

  it('drains 70 stamina, clamps, and applies pDef buff Ополчение', () => {
    const s0 = testSave({ stamina: 100 });
    const res = militiaDrill(s0);
    expect(res.ok).toBe(true);
    expect(res.save.stamina).toBe(100 - MILITIA_DRILL_STAMINA_COST);
    expect(res.save.questFlags.buff_sup_militia_drill_val).toBe(MILITIA_DRILL_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_militia_drill_stat).toBe('pDef');
    expect(res.save.questFlags.buff_sup_militia_drill_name).toBe(MILITIA_DRILL_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_militia_drill_until).toBe('string');
    expect(res.message).toContain('Ополчение');
    expect(MILITIA_DRILL_BUFF_ID).toBe('militia_drill');
    expect(res.save.questFlags.buff_sup_captain_drill_val).toBeUndefined();
    expect(res.save.questFlags.buff_sup_guard_watch_val).toBeUndefined();
  });

  it('is repeatable and clamps stamina at 0', () => {
    const first = militiaDrill(testSave({ stamina: MILITIA_DRILL_STAMINA_COST }));
    expect(first.ok).toBe(true);
    expect(first.save.stamina).toBe(0);

    const second = militiaDrill(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.stamina).toBe(0);

    const again = militiaDrill(testSave({ stamina: 200 }));
    expect(again.ok).toBe(true);
    expect(again.save.stamina).toBe(200 - MILITIA_DRILL_STAMINA_COST);
  });
});

describe('militiaWatch', () => {
  it('pays 40 adena once and locks with quest_militia_watch_complete', () => {
    const first = militiaWatch(testSave({ adena: 10, stamina: 80 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(10 + MILITIA_WATCH_REWARD_ADENA);
    expect(first.save.stamina).toBe(80);
    expect(first.save.questFlags[MILITIA_WATCH_COMPLETE_FLAG]).toBe(true);
    expect(first.save.questFlags.quest_guard_report_complete).toBeUndefined();
    expect(first.save.questFlags.quest_guard_report_active).toBeUndefined();

    const second = militiaWatch(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.adena).toBe(10 + MILITIA_WATCH_REWARD_ADENA);
    expect(second.message).toContain('уже');
  });
});

describe('citizen militia dialogue plugin', () => {
  it('generateCitizenMilitiaDialogue returns null for other npcs', () => {
    expect(
      generateCitizenMilitiaDialogue(guardCitizenNpc({ id: 'haven_citizen_plaza' }), testSave()),
    ).toBeNull();
    expect(
      generateCitizenMilitiaDialogue(guardCitizenNpc({ id: 'town_guard' }), testSave()),
    ).toBeNull();
  });

  it('generate includes militia_drill and citizen flavor', () => {
    const dlg = generateCitizenMilitiaDialogue(guardCitizenNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('militia_drill');
    expect(ids).toContain('militia_watch');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
  });

  it('hides militia_watch after complete', () => {
    const dlg = generateCitizenMilitiaDialogue(
      guardCitizenNpc(),
      testSave({ questFlags: { [MILITIA_WATCH_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('militia_drill');
    expect(ids).not.toContain('militia_watch');
  });

  it('prefixes greeting via formatCitizenGreeting', () => {
    const dlg = generateCitizenMilitiaDialogue(
      guardCitizenNpc(),
      testSave({ questFlags: { quest_board_bounty_complete: true } }),
    );
    expect(dlg?.text).toContain('контракт с городской доски закрыт');
    expect(dlg?.text).toContain('Стража Гавани');
  });

  it('apply returns null for rumors, advice, leave and unknown npc', () => {
    const npc = guardCitizenNpc();
    const save = testSave();
    expect(applyCitizenMilitiaChoice(npc, save, 'citizen_rumors')).toBeNull();
    expect(applyCitizenMilitiaChoice(npc, save, 'citizen_advice')).toBeNull();
    expect(applyCitizenMilitiaChoice(npc, save, 'citizen_leave')).toBeNull();
    expect(
      applyCitizenMilitiaChoice(guardCitizenNpc({ id: 'town_guard' }), save, 'militia_drill'),
    ).toBeNull();
  });

  it('applies drill via dialogue: stamina fail then buff', () => {
    const npc = guardCitizenNpc();
    const failed = applyCitizenMilitiaChoice(
      npc,
      testSave({ stamina: 10 }),
      'militia_drill',
    );
    expect(failed?.save.stamina).toBe(10);
    expect(failed?.save.questFlags.buff_sup_militia_drill_val).toBeUndefined();
    expect(failed?.followUp?.text).toContain('выносливости');

    const ok = applyCitizenMilitiaChoice(npc, testSave({ stamina: 200 }), 'militia_drill');
    expect(ok?.save.stamina).toBe(200 - MILITIA_DRILL_STAMINA_COST);
    expect(ok?.save.questFlags.buff_sup_militia_drill_val).toBe(MILITIA_DRILL_BUFF_AMOUNT);
    expect(ok?.followUp?.choices.map((c) => c.id)).toContain('militia_drill');
    expect(ok?.followUp?.choices.map((c) => c.id)).toContain('militia_watch');
  });

  it('applies watch once and hides the choice', () => {
    const npc = guardCitizenNpc();
    const first = applyCitizenMilitiaChoice(npc, testSave({ adena: 5 }), 'militia_watch');
    expect(first?.save.adena).toBe(5 + MILITIA_WATCH_REWARD_ADENA);
    expect(first?.save.questFlags[MILITIA_WATCH_COMPLETE_FLAG]).toBe(true);
    expect(first?.followUp?.choices.map((c) => c.id)).not.toContain('militia_watch');
    expect(first?.followUp?.choices.map((c) => c.id)).toContain('militia_drill');

    const second = applyCitizenMilitiaChoice(npc, first!.save, 'militia_watch');
    expect(second?.save.adena).toBe(5 + MILITIA_WATCH_REWARD_ADENA);
    expect(second?.followUp?.text).toContain('уже');
  });
});
