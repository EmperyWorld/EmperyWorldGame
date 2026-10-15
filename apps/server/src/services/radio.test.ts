import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import {
  activateBatteryPack,
  applyRadioLifecycle,
  canRadioTalk,
  learnFrequency,
  RADIO_BATTERY_12H_ID,
  RADIO_BATTERY_24H_ID,
  RADIO_BATTERY_PACK_ID,
  RADIO_ITEM_ID,
  RADIO_REPAIR_COST,
  RADIO_STARTER_CHARGE_MS,
  repairFieldRadio,
  setRadioPower,
  starterRadioDurationMs,
} from './radio.js';
import { sellAllBagToMerchant, sellToMerchant } from './town-services.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'radio-test',
    name: 'Tester',
    race: 'human',
    profession: 'warrior',
    level: 10,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'empery_haven',
    adena: 200000,
    inventory: [RADIO_ITEM_ID, RADIO_BATTERY_PACK_ID],
    equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    radio: {
      powerOn: false,
      sessionExpiresAt: null,
      frequencies: [],
      repaired: true,
      starterKit: true,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('radio', () => {
  it('activates 1h pack and learns frequency', () => {
    let save = baseSave();
    const act = activateBatteryPack(save, RADIO_BATTERY_PACK_ID);
    expect(act.ok).toBe(true);
    save = act.save;
    expect(save.inventory).not.toContain(RADIO_BATTERY_PACK_ID);
    expect(save.radio?.powerOn).toBe(true);
    const expires = Date.parse(save.radio!.sessionExpiresAt!);
    expect(expires - Date.now()).toBeGreaterThan(55 * 60 * 1000);
    expect(expires - Date.now()).toBeLessThan(65 * 60 * 1000);

    save = learnFrequency(save, 'rift_scout');
    expect(save.radio?.frequencies).toContain('rift_scout');

    const talk = canRadioTalk(save, 'rift_scout');
    expect(talk.ok).toBe(true);
  });

  it('activates 12h and 24h packs', () => {
    let save = baseSave({
      inventory: [RADIO_ITEM_ID, RADIO_BATTERY_12H_ID, RADIO_BATTERY_24H_ID],
    });
    const a12 = activateBatteryPack(save, RADIO_BATTERY_12H_ID);
    expect(a12.ok).toBe(true);
    const exp12 = Date.parse(a12.save.radio!.sessionExpiresAt!);
    expect(exp12 - Date.now()).toBeGreaterThan(11 * 60 * 60 * 1000);

    save = { ...a12.save, radio: { ...a12.save.radio!, powerOn: false, sessionExpiresAt: null } };
    const a24 = activateBatteryPack(save, RADIO_BATTERY_24H_ID);
    expect(a24.ok).toBe(true);
    const exp24 = Date.parse(a24.save.radio!.sessionExpiresAt!);
    expect(exp24 - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it('blocks merchant over radio', () => {
    let save = baseSave();
    save = activateBatteryPack(save).save;
    save = learnFrequency(save, 'town_captain');
    const talk = canRadioTalk(save, 'town_merchant');
    expect(talk.ok).toBe(false);
  });

  it('power off keeps session live', () => {
    let save = activateBatteryPack(baseSave()).save;
    const off = setRadioPower(save, false);
    expect(off.ok).toBe(true);
    save = off.save;
    expect(save.radio?.powerOn).toBe(false);
    expect(save.radio?.sessionExpiresAt).toBeTruthy();
    expect(canRadioTalk(save, 'rift_scout').ok).toBe(false);
  });

  it('does not sell unsellable radio', () => {
    const save = baseSave({ inventory: [RADIO_ITEM_ID, 'leather_scrap'] });
    const sellRadio = sellToMerchant(save, 0);
    expect(sellRadio.ok).toBe(false);
    const sellAll = sellAllBagToMerchant(save);
    expect(sellAll.ok).toBe(true);
    expect(sellAll.save.inventory).toContain(RADIO_ITEM_ID);
    expect(sellAll.save.inventory).not.toContain('leather_scrap');
  });

  it('grants starter radio already charged for 24h', () => {
    const createdMs = Date.now();
    let save = baseSave({
      id: 'radio-new',
      createdAt: new Date(createdMs).toISOString(),
      inventory: ['rusty_sword'],
      radio: { powerOn: false, sessionExpiresAt: null, frequencies: [] },
    });
    save = applyRadioLifecycle(save, createdMs + 1000);
    expect(save.inventory).toContain(RADIO_ITEM_ID);
    expect(save.inventory).not.toContain(RADIO_BATTERY_PACK_ID);
    expect(save.radio?.powerOn).toBe(true);
    expect(save.radio?.broken).toBe(false);
    const expires = Date.parse(save.radio!.sessionExpiresAt!);
    expect(expires - createdMs).toBe(RADIO_STARTER_CHARGE_MS);
  });

  it('grants a starter radio that breaks after 1–2 days', () => {
    const created = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    let save = baseSave({
      id: 'radio-old',
      createdAt: created,
      inventory: ['rusty_sword'],
      radio: { powerOn: false, sessionExpiresAt: null, frequencies: [] },
    });
    save = applyRadioLifecycle(save);
    expect(save.inventory).toContain(RADIO_ITEM_ID);
    expect(save.radio?.broken).toBe(true);
    expect(activateBatteryPack(save).ok).toBe(false);

    const poor = repairFieldRadio({ ...save, adena: 10 });
    expect(poor.ok).toBe(false);

    const fixed = repairFieldRadio({ ...save, adena: RADIO_REPAIR_COST });
    expect(fixed.ok).toBe(true);
    expect(fixed.save.radio?.broken).toBe(false);
    expect(fixed.save.radio?.repaired).toBe(true);
    expect(fixed.save.adena).toBe(0);
    const withPack = {
      ...fixed.save,
      inventory: [...fixed.save.inventory, RADIO_BATTERY_PACK_ID],
    };
    expect(activateBatteryPack(withPack).ok).toBe(true);
  });

  it('keeps an already-owned radio as permanently repaired', () => {
    const save = applyRadioLifecycle(
      baseSave({
        radio: { powerOn: false, sessionExpiresAt: null, frequencies: [] },
      }),
    );
    expect(save.radio?.repaired).toBe(true);
    expect(save.radio?.broken).toBe(false);
    expect(starterRadioDurationMs(save.id)).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    expect(starterRadioDurationMs(save.id)).toBeLessThan(48 * 60 * 60 * 1000);
  });
});
