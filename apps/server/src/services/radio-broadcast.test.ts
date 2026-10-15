import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { contentRoot } from './paths.js';
import { RADIO_ITEM_ID, RADIO_REPAIR_COST } from './radio.js';
import {
  applyRadioBroadcastChoice,
  generateRadioBroadcastDialogue,
  RADIO_NPC_ID,
} from './radio-broadcast-dialogue.js';
import {
  HAVEN_BROADCAST_BUFF_AMOUNT,
  HAVEN_BROADCAST_BUFF_NAME,
  HAVEN_BROADCAST_COST,
  HAVEN_BROADCAST_NEWS,
  havenBroadcastNews,
  radioSignalCheck,
  roughRadioChargeLabel,
  tuneHavenBroadcast,
} from './radio-broadcast.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-radio-player',
    name: 'RadioAdventurer',
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

function loadRadioNpc(): HavenNpcLike {
  return parseYaml(readFileSync(join(contentRoot, 'npcs/town_radio.yaml'), 'utf8')) as HavenNpcLike;
}

const otherNpc: HavenNpcLike = {
  id: 'town_priest',
  name: 'Отец Кассий',
  defaultGreeting: 'Мир тебе.',
  choices: [],
  nodes: {},
};

describe('haven broadcast news', () => {
  it('rotates three static strings by UTC hour mod 3', () => {
    expect(havenBroadcastNews(new Date(Date.UTC(2026, 0, 1, 0)))).toBe(HAVEN_BROADCAST_NEWS[0]);
    expect(havenBroadcastNews(new Date(Date.UTC(2026, 0, 1, 1)))).toBe(HAVEN_BROADCAST_NEWS[1]);
    expect(havenBroadcastNews(new Date(Date.UTC(2026, 0, 1, 2)))).toBe(HAVEN_BROADCAST_NEWS[2]);
    expect(havenBroadcastNews(new Date(Date.UTC(2026, 0, 1, 3)))).toBe(HAVEN_BROADCAST_NEWS[0]);
  });
});

describe('tuneHavenBroadcast', () => {
  it('rejects when player cannot pay', () => {
    const s0 = testSave({ adena: 5 });
    const res = tuneHavenBroadcast(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.questFlags.buff_sup_haven_broadcast_val).toBeUndefined();
    expect(res.message).toContain(String(HAVEN_BROADCAST_COST));
  });

  it('applies attackSpeed buff, deducts adena and includes city news', () => {
    const s0 = testSave({ adena: 20 });
    const res = tuneHavenBroadcast(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - HAVEN_BROADCAST_COST);
    expect(res.save.questFlags.buff_sup_haven_broadcast_val).toBe(HAVEN_BROADCAST_BUFF_AMOUNT);
    expect(res.save.questFlags.buff_sup_haven_broadcast_stat).toBe('attackSpeed');
    expect(res.save.questFlags.buff_sup_haven_broadcast_name).toBe(HAVEN_BROADCAST_BUFF_NAME);
    expect(typeof res.save.questFlags.buff_sup_haven_broadcast_until).toBe('string');
    expect(HAVEN_BROADCAST_NEWS.some((line) => res.message.includes(line))).toBe(true);
    expect(res.message).toContain(HAVEN_BROADCAST_BUFF_NAME);
  });
});

describe('radioSignalCheck', () => {
  it('reports repair cost when radio is broken', () => {
    const res = radioSignalCheck(
      testSave({
        inventory: [RADIO_ITEM_ID],
        radio: {
          powerOn: false,
          sessionExpiresAt: null,
          frequencies: [],
          broken: true,
        },
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.message).toContain(String(RADIO_REPAIR_COST));
    expect(res.save.adena).toBe(100);
  });

  it('reports powerOn and remaining charge when sessionExpiresAt is set', () => {
    const expires = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const res = radioSignalCheck(
      testSave({
        inventory: [RADIO_ITEM_ID],
        radio: {
          powerOn: true,
          sessionExpiresAt: expires,
          frequencies: [],
        },
      }),
    );
    expect(res.message).toContain('включено');
    expect(res.message).toContain('около');
    expect(res.save.radio?.sessionExpiresAt).toBe(expires);
  });

  it('reports powered-off session without mutating save', () => {
    const expires = new Date(Date.now() + 40 * 60 * 1000).toISOString();
    const s0 = testSave({
      inventory: [RADIO_ITEM_ID],
      radio: {
        powerOn: false,
        sessionExpiresAt: expires,
        frequencies: [],
      },
    });
    const res = radioSignalCheck(s0);
    expect(res.message).toContain('выключено');
    expect(res.save).toBe(s0);
  });

  it('says radio is fine when owned without an active session', () => {
    const res = radioSignalCheck(testSave({ inventory: [RADIO_ITEM_ID] }));
    expect(res.message).toBe('Рация в порядке');
  });

  it('asks to buy when the player has no radio', () => {
    const res = radioSignalCheck(testSave({ inventory: [] }));
    expect(res.message).toBe('Рации нет — купи у меня');
  });
});

describe('roughRadioChargeLabel', () => {
  it('rounds remaining time to hours or minutes', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    expect(roughRadioChargeLabel('2026-01-01T03:00:00.000Z', now)).toBe('ещё около 3 ч');
    expect(roughRadioChargeLabel('2026-01-01T00:40:00.000Z', now)).toBe('ещё около 40 мин');
    expect(roughRadioChargeLabel('2026-01-01T00:00:00.000Z', now)).toBe('заряд сел');
  });
});

describe('radio broadcast dialogue generate/apply', () => {
  it('returns null for the wrong npc', () => {
    const save = testSave();
    expect(generateRadioBroadcastDialogue(otherNpc, save)).toBeNull();
    expect(applyRadioBroadcastChoice(otherNpc, save, 'radio_broadcast')).toBeNull();
  });

  it('adds shop/broadcast/signal and keeps flavor choices', () => {
    const npc = loadRadioNpc();
    expect(npc.id).toBe(RADIO_NPC_ID);

    const dlg = generateRadioBroadcastDialogue(npc, testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'radio_shop',
        'radio_broadcast',
        'radio_signal',
        'radio_howto',
        'radio_static',
        'radio_shop_done',
      ]),
    );
    expect(dlg!.choices.find((c) => c.id === 'radio_shop')?.label).toBe('Купить батареи');
  });

  it('mentions battery charge in greeting when a session is live', () => {
    const npc = loadRadioNpc();
    const dlg = generateRadioBroadcastDialogue(
      npc,
      testSave({
        inventory: [RADIO_ITEM_ID],
        radio: {
          powerOn: true,
          sessionExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          frequencies: [],
        },
      }),
    );
    expect(dlg?.text).toContain('включена');
    expect(dlg?.text).toContain('Батареи');
  });

  it('applies mechanic choices and returns null for YAML flavor ids', () => {
    const npc = loadRadioNpc();
    const save = testSave({ adena: 20, inventory: [RADIO_ITEM_ID] });

    const shop = applyRadioBroadcastChoice(npc, save, 'radio_shop');
    expect(shop).not.toBeNull();
    expect(shop!.followUp).toBeUndefined();
    expect(shop!.save).toBe(save);

    const tuned = applyRadioBroadcastChoice(npc, save, 'radio_broadcast');
    expect(tuned).not.toBeNull();
    expect(tuned!.save.adena).toBe(20 - HAVEN_BROADCAST_COST);
    expect(tuned!.save.questFlags.buff_sup_haven_broadcast_val).toBe(HAVEN_BROADCAST_BUFF_AMOUNT);
    expect(tuned!.followUp?.choices.map((c) => c.id)).toContain('radio_shop');

    const signal = applyRadioBroadcastChoice(npc, save, 'radio_signal');
    expect(signal).not.toBeNull();
    expect(signal!.townMessage).toBe('Рация в порядке');

    expect(applyRadioBroadcastChoice(npc, save, 'radio_howto')).toBeNull();
    expect(applyRadioBroadcastChoice(npc, save, 'radio_static')).toBeNull();
    expect(applyRadioBroadcastChoice(npc, save, 'radio_shop_done')).toBeNull();
    expect(applyRadioBroadcastChoice(npc, save, 'radio_howto_bye')).toBeNull();
    expect(applyRadioBroadcastChoice(npc, save, 'radio_static_bye')).toBeNull();
  });
});
