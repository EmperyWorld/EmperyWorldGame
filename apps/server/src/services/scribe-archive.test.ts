import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { contentRoot } from './paths.js';
import { applyScribeChoice, generateScribeDialogue } from './scribe-archive-dialogue.js';
import {
  claimArchiveFolio,
  copyTravelWrit,
  PORT_FOLIO_ID,
  requestArchiveClarity,
  SCRIBE_CLARITY_AMOUNT,
  SCRIBE_CLARITY_BUFF_NAME,
  SCRIBE_CLARITY_COST,
  SCRIBE_FOLIO_ACTIVE_FLAG,
  SCRIBE_FOLIO_COMPLETE_FLAG,
  SCRIBE_SEARCH_COST,
  SCRIBE_WRIT_COST,
  startArchiveSearch,
  TRAVEL_WRIT_ID,
} from './scribe-archive.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-scribe-player',
    name: 'ScribeAdventurer',
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

function loadScribeNpc(): HavenNpcLike {
  return parseYaml(readFileSync(join(contentRoot, 'npcs/town_scribe.yaml'), 'utf8')) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_priest',
  name: 'Отец Кассий',
  defaultGreeting: 'Мир тебе.',
  choices: [],
  nodes: {},
};

describe('scribe archive services (town_scribe)', () => {
  it('rejects copy when player cannot pay', () => {
    const s0 = testSave({ adena: 5 });
    const res = copyTravelWrit(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.inventory).not.toContain(TRAVEL_WRIT_ID);
    expect(res.message).toContain(String(SCRIBE_WRIT_COST));
  });

  it('rejects search and clarity when player cannot pay', () => {
    const s0 = testSave({ adena: 4 });
    const search = startArchiveSearch(s0);
    expect(search.ok).toBe(false);
    expect(search.save.questFlags[SCRIBE_FOLIO_ACTIVE_FLAG]).toBeFalsy();
    expect(search.message).toContain(String(SCRIBE_SEARCH_COST));

    const clarity = requestArchiveClarity(s0);
    expect(clarity.ok).toBe(false);
    expect(clarity.save.questFlags.buff_sup_scribe_clarity_val).toBeUndefined();
    expect(clarity.message).toContain(String(SCRIBE_CLARITY_COST));
  });

  it('copies travel writ once and fails on duplicate', () => {
    const s0 = testSave({ adena: 50 });
    const first = copyTravelWrit(s0);
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(50 - SCRIBE_WRIT_COST);
    expect(first.save.inventory).toContain(TRAVEL_WRIT_ID);

    const dup = copyTravelWrit(first.save);
    expect(dup.ok).toBe(false);
    expect(dup.message).toBe('Грамота уже у тебя');
    expect(dup.save.adena).toBe(first.save.adena);
    expect(dup.save.inventory.filter((id) => id === TRAVEL_WRIT_ID)).toHaveLength(1);
  });

  it('starts archive search then claims folio with clarity buff', () => {
    const s0 = testSave({ adena: 40 });
    const started = startArchiveSearch(s0);
    expect(started.ok).toBe(true);
    expect(started.save.adena).toBe(40 - SCRIBE_SEARCH_COST);
    expect(started.save.questFlags[SCRIBE_FOLIO_ACTIVE_FLAG]).toBe(true);
    expect(started.save.inventory).not.toContain(PORT_FOLIO_ID);

    const remind = startArchiveSearch(started.save);
    expect(remind.ok).toBe(true);
    expect(remind.save.adena).toBe(started.save.adena);
    expect(remind.message).toContain('уже идёт');

    const claimed = claimArchiveFolio(started.save);
    expect(claimed.ok).toBe(true);
    expect(claimed.save.inventory).toContain(PORT_FOLIO_ID);
    expect(claimed.save.questFlags[SCRIBE_FOLIO_COMPLETE_FLAG]).toBe(true);
    expect(claimed.save.questFlags[SCRIBE_FOLIO_ACTIVE_FLAG]).toBeFalsy();
    expect(claimed.save.adena).toBe(started.save.adena);
    expect(claimed.save.questFlags.buff_sup_scribe_clarity_val).toBe(SCRIBE_CLARITY_AMOUNT);
    expect(claimed.save.questFlags.buff_sup_scribe_clarity_stat).toBe('accuracy');
    expect(claimed.save.questFlags.buff_sup_scribe_clarity_name).toBe(SCRIBE_CLARITY_BUFF_NAME);
  });

  it('refuses search after complete and double claim', () => {
    const started = startArchiveSearch(testSave({ adena: 40 }));
    const claimed = claimArchiveFolio(started.save);
    expect(claimed.ok).toBe(true);

    const again = claimArchiveFolio(claimed.save);
    expect(again.ok).toBe(false);
    expect(again.save.inventory.filter((id) => id === PORT_FOLIO_ID)).toHaveLength(1);
    expect(again.message).toContain('уже у тебя');

    const searchAgain = startArchiveSearch(claimed.save);
    expect(searchAgain.ok).toBe(false);
    expect(searchAgain.save.questFlags[SCRIBE_FOLIO_ACTIVE_FLAG]).toBeFalsy();
  });

  it('applies paid archive clarity buff flags', () => {
    const s0 = testSave({ adena: 30 });
    const res = requestArchiveClarity(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(30 - SCRIBE_CLARITY_COST);
    expect(res.save.questFlags.buff_sup_scribe_clarity_val).toBe(SCRIBE_CLARITY_AMOUNT);
    expect(res.save.questFlags.buff_sup_scribe_clarity_stat).toBe('accuracy');
    expect(res.save.questFlags.buff_sup_scribe_clarity_name).toBe(SCRIBE_CLARITY_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_scribe_clarity_until).toBe('string');
  });
});

describe('scribe archive dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateScribeDialogue(otherNpc, save)).toBeNull();
    expect(applyScribeChoice(otherNpc, save, 'scribe_copy_writ')).toBeNull();
  });

  it('filters search/claim by quest flags and keeps flavor choices', () => {
    const npc = loadScribeNpc();

    const idle = generateScribeDialogue(npc, testSave());
    expect(idle).not.toBeNull();
    const idleIds = idle!.choices.map((c) => c.id);
    expect(idleIds).toEqual(
      expect.arrayContaining([
        'scribe_copy_writ',
        'scribe_search',
        'scribe_clarity',
        'scribe_find',
        'scribe_rules',
        'scribe_leave',
      ]),
    );
    expect(idleIds).not.toContain('scribe_claim_folio');

    const active = generateScribeDialogue(
      npc,
      testSave({ questFlags: { [SCRIBE_FOLIO_ACTIVE_FLAG]: true } }),
    );
    const activeIds = active!.choices.map((c) => c.id);
    expect(activeIds).toContain('scribe_claim_folio');
    expect(activeIds).not.toContain('scribe_search');
    expect(active!.text).toContain('Забери опись');

    const complete = generateScribeDialogue(
      npc,
      testSave({ questFlags: { [SCRIBE_FOLIO_COMPLETE_FLAG]: true } }),
    );
    const completeIds = complete!.choices.map((c) => c.id);
    expect(completeIds).not.toContain('scribe_search');
    expect(completeIds).not.toContain('scribe_claim_folio');
  });

  it('greets the player who already holds writ or folio', () => {
    const npc = loadScribeNpc();
    const withWrit = generateScribeDialogue(npc, testSave({ inventory: [TRAVEL_WRIT_ID] }));
    expect(withWrit?.text).toContain('Путевая грамота');

    const withFolio = generateScribeDialogue(npc, testSave({ inventory: [PORT_FOLIO_ID] }));
    expect(withFolio?.text).toContain('Опись причалов');
  });

  it('applies mechanic choices and returns null for YAML flavor ids', () => {
    const npc = loadScribeNpc();
    const save = testSave({ adena: 80 });

    const copied = applyScribeChoice(npc, save, 'scribe_copy_writ');
    expect(copied).not.toBeNull();
    expect(copied!.save.inventory).toContain(TRAVEL_WRIT_ID);
    expect(copied!.townMessage).toContain('печать');

    const searched = applyScribeChoice(npc, save, 'scribe_search');
    expect(searched).not.toBeNull();
    expect(searched!.save.questFlags[SCRIBE_FOLIO_ACTIVE_FLAG]).toBe(true);

    const claimed = applyScribeChoice(npc, searched!.save, 'scribe_claim_folio');
    expect(claimed).not.toBeNull();
    expect(claimed!.save.inventory).toContain(PORT_FOLIO_ID);

    const clarity = applyScribeChoice(npc, save, 'scribe_clarity');
    expect(clarity).not.toBeNull();
    expect(clarity!.save.questFlags.buff_sup_scribe_clarity_val).toBe(SCRIBE_CLARITY_AMOUNT);

    expect(applyScribeChoice(npc, save, 'scribe_find')).toBeNull();
    expect(applyScribeChoice(npc, save, 'scribe_rules')).toBeNull();
    expect(applyScribeChoice(npc, save, 'scribe_leave')).toBeNull();
    expect(applyScribeChoice(npc, save, 'scribe_found_bye')).toBeNull();
    expect(applyScribeChoice(npc, save, 'scribe_rules_bye')).toBeNull();
  });
});
