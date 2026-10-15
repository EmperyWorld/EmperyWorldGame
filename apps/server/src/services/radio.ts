import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave, removeInventoryIndexFromSave } from './inventory-bag.js';

export const RADIO_ITEM_ID = 'field_radio';
/** Legacy 1ч комплект — оставляем id для старых сейвов. */
export const RADIO_BATTERY_1H_ID = 'radio_battery_pack';
export const RADIO_BATTERY_12H_ID = 'radio_battery_12h';
export const RADIO_BATTERY_24H_ID = 'radio_battery_24h';
/** @deprecated use RADIO_BATTERY_1H_ID */
export const RADIO_BATTERY_PACK_ID = RADIO_BATTERY_1H_ID;

export const RADIO_REPAIR_COST = 100_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Стартовый заряд при создании персонажа. */
export const RADIO_STARTER_CHARGE_MS = DAY_MS;

export const RADIO_BATTERY_DEFS = [
  { id: RADIO_BATTERY_1H_ID, label: '1 ч', durationMs: HOUR_MS, hours: 1 },
  { id: RADIO_BATTERY_12H_ID, label: '12 ч', durationMs: 12 * HOUR_MS, hours: 12 },
  { id: RADIO_BATTERY_24H_ID, label: '24 ч', durationMs: DAY_MS, hours: 24 },
] as const;

export type RadioBatteryId = (typeof RADIO_BATTERY_DEFS)[number]['id'];

const BATTERY_IDS = new Set<string>(RADIO_BATTERY_DEFS.map((d) => d.id));

/** Сервисные NPC — по рации недоступны (магазин / кузня / трактир / связист). */
export const RADIO_SERVICE_NPCS = new Set([
  'town_merchant',
  'town_blacksmith',
  'town_innkeeper',
  'town_radio',
]);

/** NPC, у которых можно записать частоту и вызвать по рации. */
export const RADIO_FREQUENCY_NPCS = new Set([
  'elder_mira',
  'silvan_hermit',
  'ash_shaman',
  'town_captain',
  'rift_scout',
  'rift_guide',
  'collapse_seer',
  'gods_oracle',
]);

export function emptyRadioState(): NonNullable<PlayerSave['radio']> {
  return {
    powerOn: false,
    sessionExpiresAt: null,
    frequencies: [],
    starterExpiresAt: null,
    broken: false,
    repaired: false,
    starterKit: false,
  };
}

/** Стабильные 24–48 часов от id сейва (срок до поломки корпуса). */
export function starterRadioDurationMs(saveId: string): number {
  let h = 2166136261;
  for (let i = 0; i < saveId.length; i++) {
    h ^= saveId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return DAY_MS + (h >>> 0) % DAY_MS;
}

export function batteryDef(packId: string) {
  return RADIO_BATTERY_DEFS.find((d) => d.id === packId);
}

export function isRadioBatteryId(id: string): id is RadioBatteryId {
  return BATTERY_IDS.has(id);
}

export function normalizeRadioState(raw: PlayerSave['radio'] | undefined): NonNullable<PlayerSave['radio']> {
  const base = emptyRadioState();
  if (!raw || typeof raw !== 'object') return base;
  const frequencies = Array.isArray(raw.frequencies)
    ? [...new Set(raw.frequencies.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
  return {
    powerOn: Boolean(raw.powerOn),
    sessionExpiresAt: typeof raw.sessionExpiresAt === 'string' ? raw.sessionExpiresAt : null,
    frequencies,
    starterExpiresAt: typeof raw.starterExpiresAt === 'string' ? raw.starterExpiresAt : null,
    broken: Boolean(raw.broken),
    repaired: Boolean(raw.repaired),
    starterKit: Boolean(raw.starterKit),
  };
}

export function hasFieldRadio(save: PlayerSave): boolean {
  return save.inventory.includes(RADIO_ITEM_ID);
}

function createdAtMs(save: PlayerSave): number {
  const t = Date.parse(save.createdAt);
  return Number.isFinite(t) ? t : Date.now();
}

function addInventoryItem(save: PlayerSave, itemId: string): PlayerSave {
  return appendItemsToSave(save, [itemId]);
}

function countBatteries(save: PlayerSave): Record<RadioBatteryId, number> {
  const out = {
    [RADIO_BATTERY_1H_ID]: 0,
    [RADIO_BATTERY_12H_ID]: 0,
    [RADIO_BATTERY_24H_ID]: 0,
  } as Record<RadioBatteryId, number>;
  for (const id of save.inventory) {
    if (isRadioBatteryId(id)) out[id] += 1;
  }
  return out;
}

function firstAvailableBattery(save: PlayerSave): RadioBatteryId | null {
  for (const def of RADIO_BATTERY_DEFS) {
    if (save.inventory.includes(def.id)) return def.id;
  }
  return null;
}

/**
 * Стартовая рация: сразу на связи 24ч; корпус живёт 1–2 суток, потом ломается один раз.
 * Старые сейвы с уже купленной рацией считаются отремонтированными.
 */
export function applyRadioLifecycle(save: PlayerSave, now = Date.now()): PlayerSave {
  let next = save;
  let radio = normalizeRadioState(next.radio);
  const created = createdAtMs(next);

  if (!radio.repaired && !radio.starterExpiresAt) {
    if (hasFieldRadio(next) && !radio.starterKit) {
      // Купленная до стартовых комплектов рация — навсегда исправна
      radio = { ...radio, repaired: true };
    } else {
      radio = {
        ...radio,
        starterExpiresAt: new Date(created + starterRadioDurationMs(next.id)).toISOString(),
      };
    }
  }

  if (!radio.starterKit) {
    if (!hasFieldRadio(next)) next = addInventoryItem(next, RADIO_ITEM_ID);
    // Сразу активируем на сутки от создания (не выдаём бесплатную батарею)
    if (!radio.sessionExpiresAt) {
      radio = {
        ...radio,
        powerOn: true,
        sessionExpiresAt: new Date(created + RADIO_STARTER_CHARGE_MS).toISOString(),
      };
    }
    radio = { ...radio, starterKit: true };
  } else if (!hasFieldRadio(next) && !radio.repaired) {
    next = addInventoryItem(next, RADIO_ITEM_ID);
  }

  if (!radio.repaired && radio.starterExpiresAt) {
    const until = Date.parse(radio.starterExpiresAt);
    if (Number.isFinite(until) && now >= until) {
      radio = {
        ...radio,
        broken: true,
        powerOn: false,
        sessionExpiresAt: null,
      };
    }
  }

  next = { ...next, radio };

  if (!radio.sessionExpiresAt) {
    if (!radio.powerOn) return next;
    return { ...next, radio: { ...radio, powerOn: false } };
  }
  const expires = Date.parse(radio.sessionExpiresAt);
  if (!Number.isFinite(expires) || now < expires) return next;
  return {
    ...next,
    radio: { ...radio, powerOn: false, sessionExpiresAt: null },
  };
}

export function expireRadioSession(save: PlayerSave, now = Date.now()): PlayerSave {
  return applyRadioLifecycle(save, now);
}

export function isRadioSessionLive(save: PlayerSave, now = Date.now()): boolean {
  const next = expireRadioSession(save, now);
  const radio = normalizeRadioState(next.radio);
  if (radio.broken) return false;
  return Boolean(radio.sessionExpiresAt && Date.parse(radio.sessionExpiresAt) > now);
}

export function isRadioPowered(save: PlayerSave, now = Date.now()): boolean {
  const next = expireRadioSession(save, now);
  const radio = normalizeRadioState(next.radio);
  if (radio.broken) return false;
  return Boolean(radio.powerOn && radio.sessionExpiresAt && Date.parse(radio.sessionExpiresAt) > now);
}

export function isRadioBroken(save: PlayerSave, now = Date.now()): boolean {
  const next = expireRadioSession(save, now);
  return Boolean(normalizeRadioState(next.radio).broken);
}

export function learnFrequency(save: PlayerSave, npcId: string): PlayerSave {
  if (!RADIO_FREQUENCY_NPCS.has(npcId)) return save;
  const radio = normalizeRadioState(save.radio);
  if (radio.frequencies.includes(npcId)) return { ...save, radio };
  return {
    ...save,
    radio: { ...radio, frequencies: [...radio.frequencies, npcId] },
  };
}

export function canRadioTalk(save: PlayerSave, npcId: string, now = Date.now()): { ok: boolean; message: string; save: PlayerSave } {
  const next = expireRadioSession(save, now);
  if (RADIO_SERVICE_NPCS.has(npcId)) {
    return { ok: false, message: 'По рации нельзя вызвать городские сервисы.', save: next };
  }
  if (!RADIO_FREQUENCY_NPCS.has(npcId)) {
    return { ok: false, message: 'На эту частоту нельзя выйти.', save: next };
  }
  if (!hasFieldRadio(next)) {
    return { ok: false, message: 'Нет полевой рации.', save: next };
  }
  if (isRadioBroken(next, now)) {
    return {
      ok: false,
      message: 'Рация сломалась. Отнеси её Связисту Рену в Гавань — ремонт 100000 adena.',
      save: next,
    };
  }
  const radio = normalizeRadioState(next.radio);
  if (!radio.frequencies.includes(npcId)) {
    return { ok: false, message: 'Частота не записана. Сначала поговори с NPC лично.', save: next };
  }
  if (!isRadioPowered(next, now)) {
    return { ok: false, message: 'Рация выключена или батареи сели. Активируй комплект.', save: next };
  }
  return { ok: true, message: 'ok', save: next };
}

export function activateBatteryPack(
  save: PlayerSave,
  packId?: string,
  now = Date.now(),
): { ok: boolean; message: string; save: PlayerSave } {
  let next = expireRadioSession(save, now);
  if (!hasFieldRadio(next)) {
    return { ok: false, message: 'Нет полевой рации.', save: next };
  }
  if (isRadioBroken(next, now)) {
    return {
      ok: false,
      message: 'Рация сломана. Ремонт у Связиста Рена в Гавани — 100000 adena.',
      save: next,
    };
  }
  if (isRadioSessionLive(next, now)) {
    return { ok: false, message: 'Сессия ещё идёт — дождись конца заряда.', save: next };
  }

  const chosen = packId && isRadioBatteryId(packId) ? packId : firstAvailableBattery(next);
  if (!chosen) {
    return { ok: false, message: 'Нет комплекта батареек.', save: next };
  }
  const def = batteryDef(chosen);
  if (!def) {
    return { ok: false, message: 'Неизвестный комплект батареек.', save: next };
  }
  const packIdx = next.inventory.indexOf(chosen);
  if (packIdx < 0) {
    return { ok: false, message: `Нет комплекта на ${def.label}.`, save: next };
  }

  const withoutPack = removeInventoryIndexFromSave(next, packIdx);
  if (!withoutPack) {
    return { ok: false, message: `Нет комплекта на ${def.label}.`, save: next };
  }

  const radio = normalizeRadioState(next.radio);
  next = {
    ...withoutPack,
    radio: {
      ...radio,
      powerOn: true,
      sessionExpiresAt: new Date(now + def.durationMs).toISOString(),
    },
  };
  return {
    ok: true,
    message: `Комплект на ${def.label} активирован. Рация на связи.`,
    save: next,
  };
}

export function setRadioPower(save: PlayerSave, on: boolean, now = Date.now()): { ok: boolean; message: string; save: PlayerSave } {
  let next = expireRadioSession(save, now);
  if (!hasFieldRadio(next)) {
    return { ok: false, message: 'Нет полевой рации.', save: next };
  }
  if (isRadioBroken(next, now)) {
    return {
      ok: false,
      message: 'Рация сломана. Ремонт у Связиста Рена в Гавани — 100000 adena.',
      save: next,
    };
  }
  const radio = normalizeRadioState(next.radio);
  if (on && !isRadioSessionLive(next, now)) {
    return { ok: false, message: 'Нет активного заряда. Активируй комплект батареек.', save: next };
  }
  next = { ...next, radio: { ...radio, powerOn: on } };
  return {
    ok: true,
    message: on ? 'Рация включена.' : 'Рация выключена. Заряд всё равно сгорит по таймеру.',
    save: next,
  };
}

export function repairFieldRadio(save: PlayerSave, now = Date.now()): { ok: boolean; message: string; save: PlayerSave } {
  let next = expireRadioSession(save, now);
  const radio = normalizeRadioState(next.radio);
  if (radio.repaired && !radio.broken && hasFieldRadio(next)) {
    return { ok: false, message: 'Рация уже в порядке.', save: next };
  }
  if (!radio.broken && radio.repaired) {
    if (!hasFieldRadio(next)) {
      next = addInventoryItem(next, RADIO_ITEM_ID);
      return { ok: true, message: 'Вернул тебе рацию — она уже чинилась.', save: next };
    }
    return { ok: false, message: 'Рация уже в порядке.', save: next };
  }
  const adena = next.adena ?? 0;
  if (adena < RADIO_REPAIR_COST) {
    return {
      ok: false,
      message: `Не хватает adena. Ремонт стоит ${RADIO_REPAIR_COST}, у тебя ${adena}.`,
      save: next,
    };
  }
  if (!hasFieldRadio(next)) next = addInventoryItem(next, RADIO_ITEM_ID);
  next = {
    ...next,
    adena: adena - RADIO_REPAIR_COST,
    radio: {
      ...normalizeRadioState(next.radio),
      broken: false,
      repaired: true,
      powerOn: false,
      sessionExpiresAt: null,
    },
  };
  return {
    ok: true,
    message: `Рация починена (−${RADIO_REPAIR_COST} adena). Дальше нужны только батарейки.`,
    save: next,
  };
}

export function radioStatus(save: PlayerSave, now = Date.now()) {
  const next = expireRadioSession(save, now);
  const radio = normalizeRadioState(next.radio);
  const expiresAt = radio.sessionExpiresAt ? Date.parse(radio.sessionExpiresAt) : null;
  const remainingMs =
    expiresAt && Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : 0;
  const starterUntil = radio.starterExpiresAt ? Date.parse(radio.starterExpiresAt) : null;
  const starterRemainingMs =
    !radio.repaired && starterUntil && Number.isFinite(starterUntil)
      ? Math.max(0, starterUntil - now)
      : 0;
  const batteries = countBatteries(next);
  const batteryPacks = Object.values(batteries).reduce((a, b) => a + b, 0);
  return {
    save: next,
    owned: hasFieldRadio(next),
    powerOn: isRadioPowered(next, now),
    sessionLive: isRadioSessionLive(next, now),
    sessionExpiresAt: radio.sessionExpiresAt,
    remainingMs,
    frequencies: radio.frequencies,
    batteryPacks,
    batteries,
    batteryOffers: RADIO_BATTERY_DEFS.map((d) => ({
      id: d.id,
      label: d.label,
      hours: d.hours,
      count: batteries[d.id],
    })),
    broken: Boolean(radio.broken),
    repaired: Boolean(radio.repaired),
    starterExpiresAt: radio.starterExpiresAt ?? null,
    starterRemainingMs,
    repairCost: RADIO_REPAIR_COST,
  };
}
