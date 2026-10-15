import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { contentRoot } from './paths.js';
import {
  GUARD_FINE_COST,
  GUARD_FINE_KARMA_CUT,
  GUARD_REPORT_ACTIVE_FLAG,
  GUARD_REPORT_COMPLETE_FLAG,
  GUARD_REPORT_HUD,
  GUARD_REPORT_REWARD_ADENA,
  GUARD_WATCH_BUFF_AMOUNT,
  GUARD_WATCH_BUFF_ID,
  GUARD_WATCH_BUFF_NAME,
  acceptWatchReport,
  claimGuardReport,
  payCityFine,
} from './guard-watch.js';
import {
  GUARD_BOUNTY_WELCOME_TEXT,
  GUARD_KARMA_THREAT_TEXT,
  applyGuardChoice,
  generateGuardDialogue,
} from './guard-watch-dialogue.js';

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

function guardNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_guard.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('payCityFine', () => {
  it('fails when karma is 0 with the city-fine message', () => {
    const res = payCityFine(testSave({ karma: 0, adena: 100 }));
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Кармы греха нет — штраф не за что');
    expect(res.save.adena).toBe(100);
    expect(res.save.karma).toBe(0);
  });

  it('fails when karma is negative', () => {
    const res = payCityFine(testSave({ karma: -8, adena: 100 }));
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Кармы греха нет — штраф не за что');
    expect(res.save.karma).toBe(-8);
  });

  it('fails without enough adena and does not cut karma', () => {
    const res = payCityFine(testSave({ karma: 40, adena: 10 }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(GUARD_FINE_COST));
    expect(res.save.karma).toBe(40);
    expect(res.save.adena).toBe(10);
  });

  it('cuts min(karma, 25) and charges 30 adena, never below 0', () => {
    const small = payCityFine(testSave({ karma: 10, adena: 80 }));
    expect(small.ok).toBe(true);
    expect(small.save.karma).toBe(0);
    expect(small.save.adena).toBe(80 - GUARD_FINE_COST);

    const exact = payCityFine(testSave({ karma: GUARD_FINE_KARMA_CUT, adena: GUARD_FINE_COST }));
    expect(exact.ok).toBe(true);
    expect(exact.save.karma).toBe(0);
    expect(exact.save.adena).toBe(0);

    const large = payCityFine(testSave({ karma: 40, adena: 100 }));
    expect(large.ok).toBe(true);
    expect(large.save.karma).toBe(40 - GUARD_FINE_KARMA_CUT);
    expect(large.save.adena).toBe(100 - GUARD_FINE_COST);
    expect(large.save.karma).toBeGreaterThan(0);
  });

  it('is distinct from cathedral confess: leftover karma stays', () => {
    const res = payCityFine(testSave({ karma: 50, adena: 100 }));
    expect(res.save.karma).toBe(25);
    expect(res.save.adena).toBe(70);
  });
});

describe('watch report', () => {
  it('accepts a one-time report', () => {
    const res = acceptWatchReport(testSave());
    expect(res.ok).toBe(true);
    expect(res.save.questFlags[GUARD_REPORT_ACTIVE_FLAG]).toBe(true);
    expect(res.save.questFlags[GUARD_REPORT_COMPLETE_FLAG]).toBeFalsy();
  });

  it('reminds when already active without duplicating the flag', () => {
    const first = acceptWatchReport(testSave());
    const again = acceptWatchReport(first.save);
    expect(again.ok).toBe(true);
    expect(again.message).toContain('уже');
    expect(again.save.questFlags[GUARD_REPORT_ACTIVE_FLAG]).toBe(true);
  });

  it('rejects accept after complete', () => {
    const claimed = claimGuardReport(
      testSave({ questFlags: { [GUARD_REPORT_ACTIVE_FLAG]: true } }),
    );
    const again = acceptWatchReport(claimed.save);
    expect(again.ok).toBe(false);
    expect(again.message).toContain('закрыт');
  });

  it('claims 40 adena, complete lock, accuracy buff, and hides active', () => {
    const accepted = acceptWatchReport(testSave({ adena: 5 }));
    const claimed = claimGuardReport(accepted.save);
    expect(claimed.ok).toBe(true);
    expect(claimed.save.adena).toBe(5 + GUARD_REPORT_REWARD_ADENA);
    expect(claimed.save.questFlags[GUARD_REPORT_COMPLETE_FLAG]).toBe(true);
    expect(claimed.save.questFlags[GUARD_REPORT_ACTIVE_FLAG]).toBeFalsy();
    expect(claimed.save.questFlags[`buff_sup_${GUARD_WATCH_BUFF_ID}_val`]).toBe(
      GUARD_WATCH_BUFF_AMOUNT,
    );
    expect(claimed.save.questFlags[`buff_sup_${GUARD_WATCH_BUFF_ID}_stat`]).toBe('accuracy');
    expect(claimed.save.questFlags[`buff_sup_${GUARD_WATCH_BUFF_ID}_name`]).toBe(
      GUARD_WATCH_BUFF_NAME,
    );
    expect(claimed.message).toContain(GUARD_WATCH_BUFF_NAME);
  });

  it('rejects claim without active flag', () => {
    const res = claimGuardReport(testSave({ adena: 0 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(0);
    expect(res.message).toContain('рапорт');
  });

  it('rejects a second claim after complete', () => {
    const first = claimGuardReport(
      testSave({
        adena: 0,
        questFlags: { [GUARD_REPORT_ACTIVE_FLAG]: true },
      }),
    );
    expect(first.ok).toBe(true);
    const second = claimGuardReport(first.save);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('уже');
    expect(second.save.adena).toBe(GUARD_REPORT_REWARD_ADENA);
  });

  it('exports the HUD line for the integrator', () => {
    expect(GUARD_REPORT_HUD).toBe('Квест: доложи стражу Леону у ворот [E]');
  });
});

describe('guard dialogue plugin', () => {
  it('generateGuardDialogue returns null for other npcs', () => {
    expect(generateGuardDialogue(guardNpc({ id: 'town_miller' }), testSave())).toBeNull();
  });

  it('threatens PK players with positive karma (L2 chaotic)', () => {
    const dlg = generateGuardDialogue(guardNpc(), testSave({ karma: 10 }));
    expect(dlg?.text).toBe(GUARD_KARMA_THREAT_TEXT);
    expect(dlg?.portrait).toContain('serious');
  });

  it('copies bounty-hero greeting from dialogue.ts', () => {
    const dlg = generateGuardDialogue(
      guardNpc(),
      testSave({ questFlags: { quest_board_bounty_complete: true } }),
    );
    expect(dlg?.text).toBe(GUARD_BOUNTY_WELCOME_TEXT);
    expect(dlg?.portrait).toContain('happy');
  });

  it('uses default greeting when karma is clean and bounty is open', () => {
    const npc = guardNpc();
    const dlg = generateGuardDialogue(npc, testSave());
    expect(dlg?.text).toBe(npc.defaultGreeting);
    expect(dlg?.portrait).toContain('neutral');
  });

  it('shows flavor plus accept; hides fine and claim on a clean save', () => {
    const dlg = generateGuardDialogue(guardNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('guard_rules');
    expect(ids).toContain('guard_trouble');
    expect(ids).toContain('guard_leave');
    expect(ids).toContain('guard_report_accept');
    expect(ids).not.toContain('guard_report_claim');
    expect(ids).not.toContain('guard_fine');
  });

  it('shows guard_fine only when karma > 0', () => {
    const clean = generateGuardDialogue(guardNpc(), testSave({ karma: 0 }));
    expect(clean!.choices.map((c) => c.id)).not.toContain('guard_fine');

    const sinner = generateGuardDialogue(guardNpc(), testSave({ karma: 12 }));
    expect(sinner!.choices.map((c) => c.id)).toContain('guard_fine');
  });

  it('hides accept and shows claim while report is active', () => {
    const dlg = generateGuardDialogue(
      guardNpc(),
      testSave({ questFlags: { [GUARD_REPORT_ACTIVE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('guard_report_claim');
    expect(ids).not.toContain('guard_report_accept');
  });

  it('hides accept and claim after complete', () => {
    const dlg = generateGuardDialogue(
      guardNpc(),
      testSave({ questFlags: { [GUARD_REPORT_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).not.toContain('guard_report_accept');
    expect(ids).not.toContain('guard_report_claim');
    expect(ids).toContain('guard_rules');
  });

  it('applyGuardChoice returns null for unknown npc', () => {
    expect(applyGuardChoice(testSave(), guardNpc({ id: 'town_miller' }), 'guard_fine')).toBeNull();
  });

  it('falls through YAML flavor choices', () => {
    const npc = guardNpc();
    const save = testSave();
    expect(applyGuardChoice(save, npc, 'guard_rules')).toBeNull();
    expect(applyGuardChoice(save, npc, 'guard_trouble')).toBeNull();
    expect(applyGuardChoice(save, npc, 'guard_leave')).toBeNull();
    expect(applyGuardChoice(save, npc, 'guard_rules_bye')).toBeNull();
    expect(applyGuardChoice(save, npc, 'guard_trouble_bye')).toBeNull();
  });

  it('pays the city fine through applyGuardChoice', () => {
    const npc = guardNpc();
    const failed = applyGuardChoice(testSave({ karma: 0 }), npc, 'guard_fine');
    expect(failed?.followUp?.text).toContain('штраф не за что');

    const paid = applyGuardChoice(testSave({ karma: 40, adena: 80 }), npc, 'guard_fine');
    expect(paid?.save.karma).toBe(15);
    expect(paid?.save.adena).toBe(50);
    expect(paid?.followUp?.choices.map((c) => c.id)).toContain('guard_rules');
    expect(paid?.followUp?.choices.map((c) => c.id)).toContain('guard_fine');
  });

  it('accepts and claims the report through applyGuardChoice', () => {
    const npc = guardNpc();
    const accepted = applyGuardChoice(testSave(), npc, 'guard_report_accept');
    expect(accepted?.save.questFlags[GUARD_REPORT_ACTIVE_FLAG]).toBe(true);
    expect(accepted?.followUp?.choices.map((c) => c.id)).toContain('guard_report_claim');
    expect(accepted?.followUp?.choices.map((c) => c.id)).not.toContain('guard_report_accept');

    const claimed = applyGuardChoice(
      testSave({
        adena: 5,
        questFlags: { [GUARD_REPORT_ACTIVE_FLAG]: true },
      }),
      npc,
      'guard_report_claim',
    );
    expect(claimed?.save.questFlags[GUARD_REPORT_COMPLETE_FLAG]).toBe(true);
    expect(claimed?.save.adena).toBe(5 + GUARD_REPORT_REWARD_ADENA);
    expect(claimed?.followUp?.choices.map((c) => c.id)).not.toContain('guard_report_claim');
    expect(claimed?.followUp?.choices.map((c) => c.id)).not.toContain('guard_report_accept');
  });
});

describe('town_guard.yaml', () => {
  it('keeps flavor nodes and adds mechanic choices', () => {
    const npc = guardNpc();
    const ids = (npc.choices ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'guard_fine',
      'guard_report_accept',
      'guard_report_claim',
      'guard_rules',
      'guard_trouble',
      'guard_leave',
    ]);
    expect(npc.nodes.rules).toBeDefined();
    expect(npc.nodes.trouble).toBeDefined();
  });
});
