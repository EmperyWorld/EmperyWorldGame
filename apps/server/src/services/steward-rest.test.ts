import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { emptyHousingStorages, loadHousingConfig } from './housing.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';
import { applyStewardChoice, generateStewardDialogue } from './steward-rest-dialogue.js';
import {
  TENANT_REST_BUFF_AMOUNT,
  TENANT_REST_BUFF_NAME,
  TENANT_REST_COST,
  TENANT_REST_FATIGUE_RELIEF,
  TENANT_REST_NO_KEY,
  tenantRest,
} from './steward-rest.js';
import { survivalOf } from './survival.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-steward-player',
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

function ownedHousing(tier: 1 | 2 | 3 = 1): NonNullable<PlayerSave['housing']> {
  return {
    tier,
    purchasedAt: new Date().toISOString(),
    storages: emptyHousingStorages(),
  };
}

function tiredOwned(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = Date.now();
  return testSave({
    housing: ownedHousing(1),
    hp: 40,
    mp: 10,
    survival: {
      version: 1,
      satiety: 80,
      hydration: 80,
      bodyTemperature: 37,
      fatigue: 85,
      wetness: 0,
      conditions: [
        { id: 'fatigued', severity: 'deficit', kind: 'deficit', startedAt: new Date(now).toISOString() },
      ],
      events: [],
      lastSimulatedAt: new Date(now).toISOString(),
      restingUntil: null,
    },
    ...overrides,
  });
}

function stewardNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_steward.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('tenantRest', () => {
  it('fails without housing and keeps the save', () => {
    const s0 = testSave({ adena: 50, hp: 20 });
    const res = tenantRest(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toBe(TENANT_REST_NO_KEY);
    expect(res.save.adena).toBe(50);
    expect(res.save.hp).toBe(20);
    expect(res.save.questFlags.buff_sup_tenant_rest_val).toBeUndefined();
  });

  it('fails when player cannot pay and mentions the amount', () => {
    const s0 = tiredOwned({ adena: 3 });
    const res = tenantRest(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(TENANT_REST_COST));
    expect(res.message).toContain('3');
    expect(res.save.adena).toBe(3);
    expect(res.save.hp).toBe(40);
    expect(res.save.questFlags.buff_sup_tenant_rest_val).toBeUndefined();
  });

  it('costs less than inn rest (25), restores HP/MP, relieves fatigue, applies Тепло печи', () => {
    const now = Date.now();
    const s0 = tiredOwned({ adena: 40 });
    const res = tenantRest(s0, now);
    expect(res.ok).toBe(true);
    expect(TENANT_REST_COST).toBe(8);
    expect(TENANT_REST_COST).toBeLessThan(25);
    expect(res.save.adena).toBe(40 - TENANT_REST_COST);
    expect(res.save.hp).toBe(res.save.maxHp);
    expect(res.save.mp).toBe(res.save.maxMp);
    expect(survivalOf(res.save, now).fatigue).toBe(85 - TENANT_REST_FATIGUE_RELIEF);
    expect(res.save.questFlags.buff_sup_tenant_rest_val).toBe(TENANT_REST_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_tenant_rest_stat).toBe('mpRegen');
    expect(res.save.questFlags.buff_sup_tenant_rest_name).toBe(TENANT_REST_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_tenant_rest_until).toBe('string');
    expect(res.message).toContain(TENANT_REST_BUFF_NAME);
  });
});

describe('steward dialogue plugin', () => {
  it('generateStewardDialogue returns null for other npcs', () => {
    expect(generateStewardDialogue(stewardNpc({ id: 'town_butcher' }), testSave())).toBeNull();
  });

  it('matches housing config stewardNpcId', () => {
    expect(loadHousingConfig().stewardNpcId).toBe('town_steward');
  });

  it('without housing: shows buy 1/2/3 and rest, hides enter', () => {
    const dlg = generateStewardDialogue(stewardNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('steward_buy_1');
    expect(ids).toContain('steward_buy_2');
    expect(ids).toContain('steward_buy_3');
    expect(ids).toContain('steward_rest');
    expect(ids).toContain('steward_leave');
    expect(ids).not.toContain('steward_enter');
    expect(dlg!.text).toContain('Квартиры пока нет');
  });

  it('tier 1: hides buy_1, shows buy_2/3, enter, rest', () => {
    const dlg = generateStewardDialogue(stewardNpc(), testSave({ housing: ownedHousing(1) }));
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).not.toContain('steward_buy_1');
    expect(ids).toContain('steward_buy_2');
    expect(ids).toContain('steward_buy_3');
    expect(ids).toContain('steward_enter');
    expect(ids).toContain('steward_rest');
    expect(ids).toContain('steward_leave');
    expect(dlg!.text).toContain('1-комнатная');
  });

  it('tier 2: hides buy_1/2, shows buy_3, enter, rest', () => {
    const ids = generateStewardDialogue(
      stewardNpc(),
      testSave({ housing: ownedHousing(2) }),
    )!.choices.map((c) => c.id);
    expect(ids).not.toContain('steward_buy_1');
    expect(ids).not.toContain('steward_buy_2');
    expect(ids).toContain('steward_buy_3');
    expect(ids).toContain('steward_enter');
    expect(ids).toContain('steward_rest');
  });

  it('tier 3: hides all buy options, keeps enter and rest', () => {
    const ids = generateStewardDialogue(
      stewardNpc(),
      testSave({ housing: ownedHousing(3) }),
    )!.choices.map((c) => c.id);
    expect(ids).not.toContain('steward_buy_1');
    expect(ids).not.toContain('steward_buy_2');
    expect(ids).not.toContain('steward_buy_3');
    expect(ids).toContain('steward_enter');
    expect(ids).toContain('steward_rest');
    expect(ids).toContain('steward_leave');
  });

  it('apply returns null for buy/enter/leave so client/YAML still work', () => {
    const npc = stewardNpc();
    const save = testSave({ housing: ownedHousing(1) });
    expect(applyStewardChoice(npc, save, 'steward_buy_1')).toBeNull();
    expect(applyStewardChoice(npc, save, 'steward_buy_2')).toBeNull();
    expect(applyStewardChoice(npc, save, 'steward_buy_3')).toBeNull();
    expect(applyStewardChoice(npc, save, 'steward_enter')).toBeNull();
    expect(applyStewardChoice(npc, save, 'steward_leave')).toBeNull();
  });

  it('apply returns null for unknown npc', () => {
    expect(
      applyStewardChoice(stewardNpc({ id: 'town_butcher' }), tiredOwned(), 'steward_rest'),
    ).toBeNull();
  });

  it('applies tenant rest via dialogue and keeps buy/enter in follow-up', () => {
    const applied = applyStewardChoice(stewardNpc(), tiredOwned({ adena: 40 }), 'steward_rest');
    expect(applied).not.toBeNull();
    expect(applied!.save.adena).toBe(40 - TENANT_REST_COST);
    expect(applied!.save.hp).toBe(applied!.save.maxHp);
    expect(applied!.save.questFlags.buff_sup_tenant_rest_val).toBe(TENANT_REST_BUFF_AMOUNT);
    expect(applied!.townMessage).toContain(TENANT_REST_BUFF_NAME);
    const ids = applied!.followUp?.choices.map((c) => c.id) ?? [];
    expect(ids).toContain('steward_enter');
    expect(ids).toContain('steward_rest');
    expect(ids).not.toContain('steward_buy_1');
  });

  it('yaml lists steward_rest without dropping buy/enter/leave', () => {
    const npc = stewardNpc();
    const ids = npc.choices.map((c) => c.id);
    expect(ids).toEqual([
      'steward_buy_1',
      'steward_buy_2',
      'steward_buy_3',
      'steward_enter',
      'steward_rest',
      'steward_leave',
    ]);
  });
});
