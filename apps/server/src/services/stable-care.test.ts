import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT, MOUNT_STAMINA_MAX } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  STABLE_FEED_COST,
  STABLE_FEED_STAMINA,
  STABLE_GROOM_BUFF_AMOUNT,
  STABLE_GROOM_BUFF_NAME,
  STABLE_GROOM_COST,
  STABLE_HAY_COST,
  STABLE_HAY_ITEM,
  STABLE_NO_MOUNT_MESSAGE,
  stableBuyHay,
  stableFeedMount,
  stableGroomMount,
} from './stable-care.js';
import { applyStableChoice, generateStableDialogue } from './stable-care-dialogue.js';

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

function tiredMount(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return testSave({
    mount: {
      ownedId: 'field_horse',
      mounted: false,
      stamina: 100,
      staminaAt: now,
    },
    ...overrides,
  });
}

function stableNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_stable.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('stable hay item', () => {
  it('loads stable_hay from haven-stable.yaml', () => {
    const item = getItem(STABLE_HAY_ITEM);
    expect(item?.name).toBe('Охапка сена');
    expect(item?.slot).toBe('material');
  });
});

describe('stableGroomMount', () => {
  it('fails without a mount', () => {
    const res = stableGroomMount(testSave({ adena: 50 }));
    expect(res.ok).toBe(false);
    expect(res.message).toBe(STABLE_NO_MOUNT_MESSAGE);
    expect(res.save.adena).toBe(50);
  });

  it('fails when player cannot pay and mentions the amount', () => {
    const s0 = tiredMount({ adena: 5 });
    const res = stableGroomMount(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(STABLE_GROOM_COST));
    expect(res.message).toContain('5');
    expect(res.save.adena).toBe(5);
    expect(res.save.mount?.stamina).toBe(100);
    expect(res.save.questFlags.buff_sup_stable_groom_val).toBeUndefined();
  });

  it('restores stamina to max and applies speed buff flags', () => {
    const s0 = tiredMount({ adena: 40 });
    const res = stableGroomMount(s0);
    expect(res.ok).toBe(true);
    expect(res.save.mount?.ownedId).toBe('field_horse');
    expect(res.save.mount?.stamina).toBe(MOUNT_STAMINA_MAX);
    expect(res.save.mount?.staminaAt).toBeTruthy();
    expect(res.save.adena).toBe(40 - STABLE_GROOM_COST);
    expect(res.save.questFlags.buff_sup_stable_groom_val).toBe(STABLE_GROOM_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_stable_groom_stat).toBe('speed');
    expect(res.save.questFlags.buff_sup_stable_groom_name).toBe(STABLE_GROOM_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_stable_groom_until).toBe('string');
    expect(res.message).toContain(STABLE_GROOM_BUFF_NAME);
  });
});

describe('stableFeedMount', () => {
  it('fails without a mount', () => {
    const res = stableFeedMount(testSave({ inventory: [STABLE_HAY_ITEM] }));
    expect(res.ok).toBe(false);
    expect(res.message).toBe(STABLE_NO_MOUNT_MESSAGE);
    expect(res.save.inventory).toContain(STABLE_HAY_ITEM);
  });

  it('consumes hay from inventory and restores stamina without charging adena', () => {
    const s0 = tiredMount({ adena: 50, inventory: [STABLE_HAY_ITEM, 'leather_scrap'] });
    const res = stableFeedMount(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(50);
    expect(res.save.inventory).not.toContain(STABLE_HAY_ITEM);
    expect(res.save.inventory).toContain('leather_scrap');
    expect(res.save.mount?.stamina).toBe(100 + STABLE_FEED_STAMINA);
    expect(res.message).toContain('сена');
  });

  it('takes adena when bag has no hay', () => {
    const s0 = tiredMount({ adena: 30, inventory: [] });
    const res = stableFeedMount(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(30 - STABLE_FEED_COST);
    expect(res.save.mount?.stamina).toBe(100 + STABLE_FEED_STAMINA);
    expect(res.message).toContain(String(STABLE_FEED_COST));
  });

  it('fails without hay when player cannot pay and mentions the amount', () => {
    const s0 = tiredMount({ adena: 3, inventory: [] });
    const res = stableFeedMount(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(STABLE_FEED_COST));
    expect(res.save.adena).toBe(3);
    expect(res.save.mount?.stamina).toBe(100);
  });

  it('clamps stamina at max when feeding a nearly full mount', () => {
    const now = new Date().toISOString();
    const res = stableFeedMount(
      testSave({
        adena: 20,
        mount: {
          ownedId: 'field_horse',
          mounted: false,
          stamina: 900,
          staminaAt: now,
        },
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.save.mount?.stamina).toBe(MOUNT_STAMINA_MAX);
  });
});

describe('stableBuyHay', () => {
  it('sells one hay for adena', () => {
    const res = stableBuyHay(testSave({ adena: 20, inventory: [] }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - STABLE_HAY_COST);
    expect(res.save.inventory).toContain(STABLE_HAY_ITEM);
    expect(res.save.mount).toBeDefined();
  });

  it('fails when poor and mentions the amount', () => {
    const res = stableBuyHay(testSave({ adena: 2 }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(STABLE_HAY_COST));
    expect(res.save.adena).toBe(2);
    expect(res.save.inventory).not.toContain(STABLE_HAY_ITEM);
  });
});

describe('stable care dialogue plugin', () => {
  it('generateStableDialogue returns null for other npcs', () => {
    expect(generateStableDialogue(stableNpc({ id: 'town_butcher' }), testSave())).toBeNull();
  });

  it('keeps YAML flavor choices and adds groom/feed/hay', () => {
    const dlg = generateStableDialogue(stableNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('stable_groom');
    expect(ids).toContain('stable_feed');
    expect(ids).toContain('stable_buy_hay');
    expect(ids).toContain('stable_mount');
    expect(ids).toContain('stable_charge');
    expect(ids).toContain('stable_puppy');
    expect(ids).toContain('stable_leave');
    expect(dlg!.text).toContain('лошади');
  });

  it('mentions tired stamina when the mount is worn out', () => {
    const dlg = generateStableDialogue(stableNpc(), tiredMount());
    expect(dlg!.text).toContain('устал');
    expect(dlg!.text).toContain('100');
    expect(dlg!.text).toContain(String(MOUNT_STAMINA_MAX));
  });

  it('mentions rested stamina when the mount is fresh', () => {
    const now = new Date().toISOString();
    const dlg = generateStableDialogue(
      stableNpc(),
      testSave({
        mount: {
          ownedId: 'field_horse',
          mounted: false,
          stamina: MOUNT_STAMINA_MAX,
          staminaAt: now,
        },
      }),
    );
    expect(dlg!.text).toContain('отдохнул');
    expect(dlg!.text).toContain(String(MOUNT_STAMINA_MAX));
  });

  it('applyStableChoice returns null for unknown npc', () => {
    expect(applyStableChoice(tiredMount(), stableNpc({ id: 'town_butcher' }), 'stable_groom')).toBeNull();
  });

  it('falls through YAML flavor choices and bye nodes', () => {
    const npc = stableNpc();
    const save = tiredMount();
    expect(applyStableChoice(save, npc, 'stable_mount')).toBeNull();
    expect(applyStableChoice(save, npc, 'stable_charge')).toBeNull();
    expect(applyStableChoice(save, npc, 'stable_puppy')).toBeNull();
    expect(applyStableChoice(save, npc, 'stable_leave')).toBeNull();
    expect(applyStableChoice(save, npc, 'stable_mount_bye')).toBeNull();
    expect(applyStableChoice(save, npc, 'stable_charge_bye')).toBeNull();
    expect(applyStableChoice(save, npc, 'stable_puppy_bye')).toBeNull();
  });

  it('applies groom via dialogue', () => {
    const applied = applyStableChoice(tiredMount({ adena: 40 }), stableNpc(), 'stable_groom');
    expect(applied).not.toBeNull();
    expect(applied!.save.mount?.stamina).toBe(MOUNT_STAMINA_MAX);
    expect(applied!.save.questFlags.buff_sup_stable_groom_val).toBe(STABLE_GROOM_BUFF_AMOUNT);
    expect(applied!.townMessage).toContain(STABLE_GROOM_BUFF_NAME);
    expect(applied!.followUp?.text).toContain(STABLE_GROOM_BUFF_NAME);
  });

  it('applies feed via dialogue using hay then adena', () => {
    const npc = stableNpc();
    const withHay = applyStableChoice(
      tiredMount({ adena: 40, inventory: [STABLE_HAY_ITEM] }),
      npc,
      'stable_feed',
    );
    expect(withHay?.save.adena).toBe(40);
    expect(withHay?.save.inventory).not.toContain(STABLE_HAY_ITEM);
    expect(withHay?.save.mount?.stamina).toBe(100 + STABLE_FEED_STAMINA);

    const withAdena = applyStableChoice(tiredMount({ adena: 40 }), npc, 'stable_feed');
    expect(withAdena?.save.adena).toBe(40 - STABLE_FEED_COST);
    expect(withAdena?.followUp?.text).toContain(String(STABLE_FEED_STAMINA));
  });

  it('applies buy hay via dialogue', () => {
    const applied = applyStableChoice(testSave({ adena: 20 }), stableNpc(), 'stable_buy_hay');
    expect(applied?.save.inventory).toContain(STABLE_HAY_ITEM);
    expect(applied?.save.adena).toBe(20 - STABLE_HAY_COST);
    expect(applied?.followUp?.text).toContain('сена');
  });
});
