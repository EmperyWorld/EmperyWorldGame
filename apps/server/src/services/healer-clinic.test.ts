import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave, SurvivalState } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { applyHealerChoice, generateHealerDialogue } from './healer-clinic-dialogue.js';
import {
  HEALER_DIAGNOSE_CLEAR,
  HEALER_KIT_COST,
  HEALER_LONG_COST,
  HEALER_TREAT_COST,
  SERA_BANDAGE_ID,
  SERA_CARE_BUFF_AMOUNT,
  SERA_CARE_BUFF_NAME,
  countSeraBandages,
  healerDiagnose,
  healerFieldKit,
  healerLongCare,
  healerTreat,
} from './healer-clinic.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-healer-player',
    name: 'HealerAdventurer',
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

function survivalPatch(overrides: Partial<SurvivalState> = {}): SurvivalState {
  const now = new Date().toISOString();
  return {
    version: 1,
    satiety: 80,
    hydration: 80,
    bodyTemperature: 37,
    fatigue: 50,
    wetness: 0,
    conditions: [],
    events: [],
    lastSimulatedAt: now,
    restingUntil: null,
    ...overrides,
  };
}

function loadHealerNpc(): HavenNpcLike {
  return parseYaml(readFileSync(join(contentRoot, 'npcs/town_healer.yaml'), 'utf8')) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_priest',
  name: 'Отец Кассий',
  defaultGreeting: 'Мир тебе.',
  choices: [],
  nodes: {},
};

describe('sera_bandage item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads from haven-healer.yaml as a bandage tool', () => {
    const item = getItem(SERA_BANDAGE_ID);
    expect(item?.name).toBe('Полевой бинт Серы');
    expect(item?.slot).toBe('consumable');
    expect(item?.survival?.tool).toBe('bandage');
    expect(item?.description?.toLowerCase()).toContain('полевой бинт серы');
  });
});

describe('healer clinic services (town_healer)', () => {
  it('rejects kit and long care when player cannot pay', () => {
    const s0 = testSave({ adena: 10 });
    const kit = healerFieldKit(s0);
    expect(kit.ok).toBe(false);
    expect(kit.save.adena).toBe(10);
    expect(kit.save.inventory).not.toContain(SERA_BANDAGE_ID);
    expect(kit.message).toContain(String(HEALER_KIT_COST));

    const care = healerLongCare(s0);
    expect(care.ok).toBe(false);
    expect(care.save.adena).toBe(10);
    expect(care.save.hp).toBe(s0.hp);
    expect(care.save.questFlags.buff_sup_sera_care_val).toBeUndefined();
    expect(care.message).toContain(String(HEALER_LONG_COST));
  });

  it('sells a field kit and still sells when bag already has 3+', () => {
    const first = healerFieldKit(testSave({ adena: 50 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(50 - HEALER_KIT_COST);
    expect(first.save.inventory).toContain(SERA_BANDAGE_ID);
    expect(countSeraBandages(first.save)).toBe(1);

    const stacked = healerFieldKit(
      testSave({ adena: 80, inventory: [SERA_BANDAGE_ID, SERA_BANDAGE_ID, SERA_BANDAGE_ID] }),
    );
    expect(stacked.ok).toBe(true);
    expect(stacked.save.adena).toBe(80 - HEALER_KIT_COST);
    expect(countSeraBandages(stacked.save)).toBe(4);
    expect(stacked.message).toContain('не лишний');
  });

  it('long care costs more than treat, fills vitals, relieves fatigue, applies sera_care', () => {
    expect(HEALER_LONG_COST).toBeGreaterThan(HEALER_TREAT_COST);
    const s0 = testSave({
      adena: 80,
      hp: 22,
      mp: 4,
      survival: survivalPatch({ fatigue: 70 }),
    });
    const res = healerLongCare(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(80 - HEALER_LONG_COST);
    expect(res.save.hp).toBe(res.save.maxHp);
    expect(res.save.mp).toBe(res.save.maxMp);
    expect(res.save.survival?.fatigue).toBeLessThan(70);
    expect(res.save.questFlags.buff_sup_sera_care_val).toBe(SERA_CARE_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_sera_care_stat).toBe('mDef');
    expect(res.save.questFlags.buff_sup_sera_care_name).toBe(SERA_CARE_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_sera_care_until).toBe('string');
    expect(res.message).toContain(SERA_CARE_BUFF_NAME);
  });

  it('diagnose is read-only and lists conditions or a clear line', () => {
    const healthy = testSave({ adena: 33 });
    const clear = healerDiagnose(healthy);
    expect(clear.ok).toBe(true);
    expect(clear.save).toBe(healthy);
    expect(clear.save.adena).toBe(33);
    expect(clear.message).toBe(HEALER_DIAGNOSE_CLEAR);

    const hurt = testSave({
      adena: 40,
      survival: survivalPatch({
        conditions: [
          { id: 'infection', severity: 'deficit', kind: 'illness', startedAt: new Date().toISOString() },
          { id: 'frostbite', severity: 'deficit', kind: 'injury', startedAt: new Date().toISOString() },
        ],
      }),
    });
    const listed = healerDiagnose(hurt);
    expect(listed.ok).toBe(true);
    expect(listed.save.adena).toBe(40);
    expect(listed.save.survival?.conditions).toHaveLength(2);
    expect(listed.message).toContain('инфекция');
    expect(listed.message).toContain('обморожение');
    expect(listed.message).toContain('Гибель');
  });

  it('healerTreat wrapper delegates to treatAtNpc without clinic apply', () => {
    const hurt = testSave({
      adena: 50,
      survival: survivalPatch({
        conditions: [
          { id: 'infection', severity: 'deficit', kind: 'illness', startedAt: new Date().toISOString() },
        ],
      }),
    });
    const res = healerTreat(hurt);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(50 - HEALER_TREAT_COST);
    expect(res.save.survival?.conditions).toHaveLength(0);
  });
});

describe('healer clinic dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateHealerDialogue(otherNpc, save)).toBeNull();
    expect(applyHealerChoice(otherNpc, save, 'healer_kit')).toBeNull();
  });

  it('adds clinic choices and keeps shop, treat, flavor', () => {
    const npc = loadHealerNpc();
    const dlg = generateHealerDialogue(npc, testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'healer_shop',
        'healer_treat',
        'healer_kit',
        'healer_long',
        'healer_diagnose',
        'healer_care',
        'healer_warn',
        'healer_night',
        'healer_leave',
      ]),
    );
    expect(dlg!.text).toContain('Ночью тоже принимаю');
  });

  it('injects clinic extras even if YAML omitted them', () => {
    const slim: HavenNpcLike = {
      id: 'town_healer',
      name: 'Лекарь Сера',
      defaultGreeting: 'Клиника открыта.',
      choices: [
        { id: 'healer_shop', label: 'Купить снадобья', flag: '_healer_shop' },
        { id: 'healer_treat', label: 'Прошу лечения', flag: '_healer_treat' },
        { id: 'healer_leave', label: 'Уйти', flag: '_healer_done' },
      ],
      nodes: {},
    };
    const ids = generateHealerDialogue(slim, testSave())!.choices.map((c) => c.id);
    expect(ids).toContain('healer_kit');
    expect(ids).toContain('healer_long');
    expect(ids).toContain('healer_diagnose');
    expect(ids).toContain('healer_shop');
    expect(ids).toContain('healer_treat');
  });

  it('applies mechanic choices and returns null for shop, treat, flavor, bye', () => {
    const npc = loadHealerNpc();
    const save = testSave({ adena: 90 });

    const kit = applyHealerChoice(npc, save, 'healer_kit');
    expect(kit).not.toBeNull();
    expect(kit!.save.inventory).toContain(SERA_BANDAGE_ID);
    expect(kit!.townMessage).toContain('бинт');

    const care = applyHealerChoice(npc, save, 'healer_long');
    expect(care).not.toBeNull();
    expect(care!.save.questFlags.buff_sup_sera_care_val).toBe(SERA_CARE_BUFF_AMOUNT);
    expect(care!.followUp?.text).toContain(SERA_CARE_BUFF_NAME);

    const diag = applyHealerChoice(npc, save, 'healer_diagnose');
    expect(diag).not.toBeNull();
    expect(diag!.townMessage).toBe(HEALER_DIAGNOSE_CLEAR);
    expect(diag!.save.adena).toBe(90);

    expect(applyHealerChoice(npc, save, 'healer_shop')).toBeNull();
    expect(applyHealerChoice(npc, save, 'healer_treat')).toBeNull();
    expect(applyHealerChoice(npc, save, 'healer_care')).toBeNull();
    expect(applyHealerChoice(npc, save, 'healer_warn')).toBeNull();
    expect(applyHealerChoice(npc, save, 'healer_night')).toBeNull();
    expect(applyHealerChoice(npc, save, 'healer_leave')).toBeNull();
    expect(applyHealerChoice(npc, save, 'healer_care_bye')).toBeNull();
    expect(applyHealerChoice(npc, save, 'healer_warn_bye')).toBeNull();
  });
});
