import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  COMPANION_BREAD_ITEM_ID,
  COMPANION_NEED_MAX,
  COMPANION_SEAGULL_OFFER_RADIUS,
  COMPANION_STAT_MAX,
  TAME_SEAGULL_DENOMINATOR,
  clampCompanionNeed,
  clampCompanionStat,
  type CompanionKind,
  type CompanionState,
  type PlayerSave,
} from '@empery/shared';
import { contentRoot } from './paths.js';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { getItem } from './items.js';
import { getLocation } from './locations.js';

export interface CompanionDefinition {
  id: string;
  name: string;
  kind: CompanionKind;
  shopPrice: number;
  description?: string;
  baseObedience?: number;
  baseEnergy?: number;
  baseFetchSkill?: number;
}

let list: CompanionDefinition[] | null = null;
let byId: Map<string, CompanionDefinition> | null = null;

export function loadCompanions(): CompanionDefinition[] {
  if (list) return list;
  const dir = join(contentRoot, 'companions');
  try {
    list = readdirSync(dir)
      .filter((n) => n.endsWith('.yaml'))
      .map((n) => parseYaml(readFileSync(join(dir, n), 'utf8')) as CompanionDefinition)
      .filter((c) => Boolean(c?.id));
  } catch {
    list = [];
  }
  byId = new Map(list.map((c) => [c.id, c]));
  return list;
}

export function getCompanionDef(id: string): CompanionDefinition | undefined {
  loadCompanions();
  return byId?.get(id);
}

export function clearCompanionsCache(): void {
  list = null;
  byId = null;
}

export function normalizeCompanionState(
  raw: PlayerSave['companion'] | undefined | null,
): CompanionState | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind !== 'puppy' && raw.kind !== 'seagull') return null;
  if (typeof raw.variantId !== 'string' || !raw.variantId) return null;
  return {
    kind: raw.kind,
    variantId: raw.variantId,
    hunger: clampCompanionNeed(typeof raw.hunger === 'number' ? raw.hunger : COMPANION_NEED_MAX),
    fatigue: clampCompanionNeed(typeof raw.fatigue === 'number' ? raw.fatigue : 0),
    obedience: clampCompanionStat(typeof raw.obedience === 'number' ? raw.obedience : 400),
    energy: clampCompanionStat(typeof raw.energy === 'number' ? raw.energy : 500),
    fetchSkill: clampCompanionStat(typeof raw.fetchSkill === 'number' ? raw.fetchSkill : 300),
    tamedAt: typeof raw.tamedAt === 'string' ? raw.tamedAt : new Date().toISOString(),
    trainUntil: typeof raw.trainUntil === 'string' ? raw.trainUntil : null,
    simAt: typeof raw.simAt === 'string' ? raw.simAt : null,
  };
}

function starterFromDef(def: CompanionDefinition, kind: CompanionKind): CompanionState {
  return {
    kind,
    variantId: def.id,
    hunger: COMPANION_NEED_MAX,
    fatigue: 0,
    obedience: clampCompanionStat(def.baseObedience ?? 450),
    energy: clampCompanionStat(def.baseEnergy ?? 520),
    fetchSkill: clampCompanionStat(def.baseFetchSkill ?? 280),
    tamedAt: new Date().toISOString(),
    trainUntil: null,
    simAt: new Date().toISOString(),
  };
}

export function buyCompanion(
  save: PlayerSave,
  companionId: string,
): { ok: boolean; message: string; save: PlayerSave } {
  const def = getCompanionDef(companionId);
  if (!def || def.kind !== 'puppy') {
    return { ok: false, message: 'Такого питомца нет.', save };
  }
  if (normalizeCompanionState(save.companion)) {
    return { ok: false, message: 'У тебя уже есть спутник.', save };
  }
  const adena = save.adena ?? 0;
  if (adena < def.shopPrice) {
    return { ok: false, message: `Нужно ${def.shopPrice} adena.`, save };
  }
  return {
    ok: true,
    message: `Куплено: ${def.name}`,
    save: {
      ...save,
      adena: adena - def.shopPrice,
      companion: starterFromDef(def, 'puppy'),
    },
  };
}

const FEED_ITEMS = new Set([
  'bread_loaf',
  'travel_biscuit',
  'raw_meat',
  'cooked_meat',
  'dried_meat',
  'raw_fish',
  'cooked_fish',
  'dried_fish',
]);

export function feedCompanion(
  save: PlayerSave,
  itemId: string,
  now = Date.now(),
): { ok: boolean; message: string; save: PlayerSave } {
  const companion = normalizeCompanionState(save.companion);
  if (!companion) return { ok: false, message: 'Нет питомца.', save };
  if (companion.kind === 'seagull') {
    return { ok: false, message: 'Чайка сама о себе позаботится.', save };
  }
  if (!FEED_ITEMS.has(itemId) || !getItem(itemId)) {
    return { ok: false, message: 'Этим не накормить.', save };
  }
  const removedSave = removeItemIdsFromSave(save, [itemId]);
  if (!removedSave) return { ok: false, message: 'Нет такого предмета.', save };

  const quality = itemId.includes('cooked') || itemId === 'bread_loaf' ? 1.2 : 0.85;
  const next: CompanionState = {
    ...companion,
    hunger: clampCompanionNeed(companion.hunger + 28 * quality),
    obedience: clampCompanionStat(companion.obedience + 18 * quality),
    energy: clampCompanionStat(companion.energy + 22 * quality),
    fatigue: clampCompanionNeed(companion.fatigue - 8),
    simAt: new Date(now).toISOString(),
  };
  return {
    ok: true,
    message: 'Питомец доволен.',
    save: { ...removedSave, companion: next },
  };
}

const TRAIN_COOLDOWN_MS = 45_000;

export function trainCompanion(
  save: PlayerSave,
  now = Date.now(),
): { ok: boolean; message: string; save: PlayerSave } {
  const companion = normalizeCompanionState(save.companion);
  if (!companion) return { ok: false, message: 'Нет питомца.', save };
  if (companion.kind === 'seagull') {
    return { ok: false, message: 'Чайку не дрессируют.', save };
  }
  const until = companion.trainUntil ? Date.parse(companion.trainUntil) : 0;
  if (until > now) {
    return { ok: false, message: 'Питомец ещё отдыхает после тренировки.', save };
  }
  const next: CompanionState = {
    ...companion,
    fetchSkill: clampCompanionStat(companion.fetchSkill + 35),
    obedience: clampCompanionStat(companion.obedience + 12),
    fatigue: clampCompanionNeed(companion.fatigue + 18),
    energy: clampCompanionStat(companion.energy - 15),
    trainUntil: new Date(now + TRAIN_COOLDOWN_MS).toISOString(),
    simAt: new Date(now).toISOString(),
  };
  return {
    ok: true,
    message: 'Тренировка прошла хорошо.',
    save: { ...save, companion: next },
  };
}

/** Passive neglect / recovery while online. */
export function tickCompanionNeeds(save: PlayerSave, now = Date.now()): PlayerSave {
  const companion = normalizeCompanionState(save.companion);
  if (!companion) return save;
  if (companion.kind === 'seagull') return { ...save, companion };
  const last = companion.simAt ? Date.parse(companion.simAt) : now;
  const dtMin = Math.max(0, (now - last) / 60_000);
  if (dtMin < 0.2) return { ...save, companion };
  const hunger = clampCompanionNeed(companion.hunger - dtMin * 1.2);
  const fatigue = clampCompanionNeed(companion.fatigue + dtMin * 0.4);
  let obedience = companion.obedience;
  let energy = companion.energy;
  if (hunger < 25) {
    obedience = clampCompanionStat(obedience - dtMin * 4);
    energy = clampCompanionStat(energy - dtMin * 3);
  }
  return {
    ...save,
    companion: {
      ...companion,
      hunger,
      fatigue,
      obedience,
      energy,
      simAt: new Date(now).toISOString(),
    },
  };
}

export interface SeagullPoint {
  id: string;
  x: number;
  y: number;
}

export function seagullsForLocation(locationId: string): SeagullPoint[] {
  const loc = getLocation(locationId) as
    | (ReturnType<typeof getLocation> & { seagulls?: SeagullPoint[] })
    | undefined;
  const listPts = loc?.seagulls;
  if (!Array.isArray(listPts)) return [];
  return listPts.filter(
    (s) => s && typeof s.id === 'string' && typeof s.x === 'number' && typeof s.y === 'number',
  );
}

/**
 * Secret tame: 1/1000. Never expose chance in UI messages.
 * `roll` injectable for tests (0..denominator-1); success when roll === 0.
 */
export function offerBreadToSeagull(
  save: PlayerSave,
  input: { seagullId: string; playerX: number; playerY: number; locationId?: string },
  opts?: { now?: number; roll?: number },
): { ok: boolean; message: string; save: PlayerSave; tamed?: boolean } {
  const now = opts?.now ?? Date.now();
  if (normalizeCompanionState(save.companion)) {
    return { ok: false, message: 'У тебя уже есть спутник.', save };
  }
  const locationId = input.locationId ?? save.location;
  if (locationId !== 'empery_haven') {
    return { ok: false, message: 'Чайка не обратила внимания.', save };
  }
  const bird = seagullsForLocation(locationId).find((s) => s.id === input.seagullId);
  if (!bird) {
    return { ok: false, message: 'Чайка улетела.', save };
  }
  const d = Math.hypot(input.playerX - bird.x, input.playerY - bird.y);
  if (d > COMPANION_SEAGULL_OFFER_RADIUS) {
    return { ok: false, message: 'Подойди ближе.', save };
  }

  const removedSave = removeItemIdsFromSave(save, [COMPANION_BREAD_ITEM_ID]);
  if (!removedSave) {
    return { ok: false, message: 'Нужен хлеб.', save };
  }

  const roll =
    typeof opts?.roll === 'number'
      ? Math.floor(opts.roll) % TAME_SEAGULL_DENOMINATOR
      : Math.floor(Math.random() * TAME_SEAGULL_DENOMINATOR);

  if (roll !== 0) {
    return {
      ok: true,
      tamed: false,
      message: 'Чайка клюнула и улетела.',
      save: removedSave,
    };
  }

  const companion: CompanionState = {
    kind: 'seagull',
    variantId: 'secret_seagull',
    hunger: COMPANION_NEED_MAX,
    fatigue: 0,
    obedience: COMPANION_STAT_MAX,
    energy: 800,
    fetchSkill: 650,
    tamedAt: new Date(now).toISOString(),
    trainUntil: null,
    simAt: new Date(now).toISOString(),
  };

  return {
    ok: true,
    tamed: true,
    message: 'Чайка кружит рядом — теперь она твоя.',
    save: {
      ...removedSave,
      companion,
      questFlags: { ...removedSave.questFlags, _seagull_tamed: true },
    },
  };
}

/** Re-export for tests / routes that still need append. */
export { appendItemsToSave };
