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
import { GARDEN_ACTIVE_FLAG, GARDEN_COMPLETE_FLAG } from './garden-quest.js';
import {
  GARDEN_HARVEST_ACTIVE_FLAG,
  GARDEN_HARVEST_COMPLETE_FLAG,
  GARDEN_HARVEST_HUD,
  GARDEN_HARVEST_ITEM,
  GARDEN_HARVEST_ITEM_COUNT,
  GARDEN_HARVEST_REWARD_ADENA,
  acceptHarvest,
  claimHarvest,
} from './garden-harvest.js';
import {
  applyGardenHarvestChoice,
  generateGardenHarvestDialogue,
} from './garden-harvest-dialogue.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-garden-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'mystic',
    level: 2,
    xp: 0,
    hp: 40,
    maxHp: 100,
    mp: 10,
    maxMp: 50,
    location: 'empery_haven',
    adena: 20,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function gardenerNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_gardener.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, nodes: raw.nodes ?? {}, ...overrides };
}

function idsOf(save: PlayerSave, npc: HavenNpcLike = gardenerNpc()): string[] {
  return generateGardenHarvestDialogue(npc, save)?.choices.map((c) => c.id) ?? [];
}

describe('garden harvest item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads garden_cabbage from haven-garden.yaml', () => {
    const item = getItem(GARDEN_HARVEST_ITEM);
    expect(item?.name).toBe('Капуста с грядки');
    expect(item?.slot).toBe('consumable');
    expect(item?.survival?.nutrition).toBe(28);
    expect(item?.survival?.shelfLifeHours).toBe(72);
  });
});

describe('acceptHarvest', () => {
  it('refuses before the watering quest is complete', () => {
    const res = acceptHarvest(testSave());
    expect(res.ok).toBe(false);
    expect(res.save.questFlags[GARDEN_HARVEST_ACTIVE_FLAG]).toBeFalsy();
    expect(res.message).toContain('польём');
  });

  it('sets active after garden complete', () => {
    const res = acceptHarvest(testSave({ questFlags: { [GARDEN_COMPLETE_FLAG]: true } }));
    expect(res.ok).toBe(true);
    expect(res.save.questFlags[GARDEN_HARVEST_ACTIVE_FLAG]).toBe(true);
  });

  it('reminds when already active', () => {
    const first = acceptHarvest(testSave({ questFlags: { [GARDEN_COMPLETE_FLAG]: true } }));
    const second = acceptHarvest(first.save);
    expect(second.ok).toBe(true);
    expect(second.message).toContain('Забери');
    expect(second.save.questFlags[GARDEN_HARVEST_ACTIVE_FLAG]).toBe(true);
  });

  it('refuses after harvest complete', () => {
    const res = acceptHarvest(
      testSave({
        questFlags: {
          [GARDEN_COMPLETE_FLAG]: true,
          [GARDEN_HARVEST_COMPLETE_FLAG]: true,
        },
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.save.questFlags[GARDEN_HARVEST_ACTIVE_FLAG]).toBeFalsy();
  });
});

describe('claimHarvest', () => {
  it('refuses without an active harvest', () => {
    const res = claimHarvest(testSave({ questFlags: { [GARDEN_COMPLETE_FLAG]: true } }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(20);
  });

  it('gives two cabbages and 50 adena once', () => {
    const accepted = acceptHarvest(
      testSave({ adena: 10, questFlags: { [GARDEN_COMPLETE_FLAG]: true } }),
    );
    const claimed = claimHarvest(accepted.save);
    expect(claimed.ok).toBe(true);
    expect(claimed.save.adena).toBe(10 + GARDEN_HARVEST_REWARD_ADENA);
    expect(claimed.save.inventory.filter((id) => id === GARDEN_HARVEST_ITEM)).toHaveLength(
      GARDEN_HARVEST_ITEM_COUNT,
    );
    expect(claimed.save.questFlags[GARDEN_HARVEST_COMPLETE_FLAG]).toBe(true);
    expect(claimed.save.questFlags[GARDEN_HARVEST_ACTIVE_FLAG]).toBeFalsy();
  });

  it('rejects a second claim', () => {
    const first = claimHarvest(
      testSave({
        adena: 0,
        questFlags: {
          [GARDEN_COMPLETE_FLAG]: true,
          [GARDEN_HARVEST_ACTIVE_FLAG]: true,
        },
      }),
    );
    expect(first.ok).toBe(true);
    const second = claimHarvest(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.adena).toBe(GARDEN_HARVEST_REWARD_ADENA);
    expect(second.save.inventory.filter((id) => id === GARDEN_HARVEST_ITEM)).toHaveLength(
      GARDEN_HARVEST_ITEM_COUNT,
    );
  });
});

describe('garden harvest dialogue plugin', () => {
  it('generate always returns a menu for town_gardener and null for others', () => {
    const idle = generateGardenHarvestDialogue(gardenerNpc(), testSave());
    expect(idle).not.toBeNull();
    expect(idle?.text).toContain('Земля требует заботы');
    expect(idsOf(testSave())).toEqual(expect.arrayContaining(['garden_accept', 'garden_leave']));
    expect(idsOf(testSave())).not.toContain('garden_water');
    expect(idsOf(testSave())).not.toContain('garden_harvest_accept');

    expect(generateGardenHarvestDialogue(gardenerNpc({ id: 'town_miller' }), testSave())).toBeNull();
  });

  it('copies garden_accept / garden_water filter from the original watering quest', () => {
    const watering = idsOf(testSave({ questFlags: { [GARDEN_ACTIVE_FLAG]: true } }));
    expect(watering).toContain('garden_water');
    expect(watering).toContain('garden_leave');
    expect(watering).not.toContain('garden_accept');
    expect(watering).not.toContain('garden_harvest_accept');

    const done = idsOf(testSave({ questFlags: { [GARDEN_COMPLETE_FLAG]: true } }));
    expect(done).toContain('garden_harvest_accept');
    expect(done).toContain('garden_leave');
    expect(done).not.toContain('garden_accept');
    expect(done).not.toContain('garden_water');
    expect(done).not.toContain('garden_harvest_claim');
  });

  it('shows harvest claim while active and thanks after complete', () => {
    const active = generateGardenHarvestDialogue(
      gardenerNpc(),
      testSave({
        questFlags: {
          [GARDEN_COMPLETE_FLAG]: true,
          [GARDEN_HARVEST_ACTIVE_FLAG]: true,
        },
      }),
    );
    expect(active?.text).toContain('Забери урожай');
    expect(active?.choices.map((c) => c.id)).toContain('garden_harvest_claim');
    expect(active?.choices.map((c) => c.id)).toContain('garden_leave');
    expect(active?.choices.map((c) => c.id)).not.toContain('garden_harvest_accept');

    const complete = generateGardenHarvestDialogue(
      gardenerNpc(),
      testSave({
        questFlags: {
          [GARDEN_COMPLETE_FLAG]: true,
          [GARDEN_HARVEST_COMPLETE_FLAG]: true,
        },
      }),
    );
    expect(complete?.text).toContain('спасибо');
    expect(complete?.choices.map((c) => c.id)).toEqual(['garden_leave']);
  });

  it('apply returns null for garden_accept / garden_water / garden_leave', () => {
    const npc = gardenerNpc();
    const save = testSave();
    expect(applyGardenHarvestChoice(npc, save, 'garden_accept')).toBeNull();
    expect(applyGardenHarvestChoice(npc, save, 'garden_water')).toBeNull();
    expect(applyGardenHarvestChoice(npc, save, 'garden_leave')).toBeNull();
    expect(applyGardenHarvestChoice(gardenerNpc({ id: 'town_miller' }), save, 'garden_harvest_accept')).toBeNull();
  });

  it('apply accept then claim through the plugin', () => {
    const npc = gardenerNpc();
    const accepted = applyGardenHarvestChoice(
      npc,
      testSave({ adena: 5, questFlags: { [GARDEN_COMPLETE_FLAG]: true } }),
      'garden_harvest_accept',
    );
    expect(accepted?.save.questFlags[GARDEN_HARVEST_ACTIVE_FLAG]).toBe(true);
    expect(accepted?.followUp?.choices.map((c) => c.id)).toContain('garden_harvest_claim');

    const claimed = applyGardenHarvestChoice(npc, accepted!.save, 'garden_harvest_claim');
    expect(claimed?.save.adena).toBe(5 + GARDEN_HARVEST_REWARD_ADENA);
    expect(claimed?.save.inventory.filter((id) => id === GARDEN_HARVEST_ITEM)).toHaveLength(2);
    expect(claimed?.save.questFlags[GARDEN_HARVEST_COMPLETE_FLAG]).toBe(true);
    expect(claimed?.followUp?.text).toContain('кочана');
  });

  it('exports the HUD line for the integrator', () => {
    expect(GARDEN_HARVEST_HUD).toBe('Квест: забери урожай у садовника Ильи [E]');
  });
});
