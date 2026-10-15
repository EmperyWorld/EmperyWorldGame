import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { PlayerSave } from '@empery/shared';
import {
  MOUNT_STAMINA_MAX,
  advanceMountStamina,
  clampMountStamina,
  locationDisallowsMount,
  mountedMoveSpeed,
  mountCanRun,
} from '@empery/shared';
import { computeCarryWeightKg } from '@empery/shared';
import { contentRoot } from './paths.js';
import { getItem } from './items.js';

let mountsList: MountDefinition[] | null = null;
let mountsById: Map<string, MountDefinition> | null = null;

export interface MountDefinition {
  id: string;
  name: string;
  /** bay | ash | pale | prism — client palette */
  visual?: 'bay' | 'ash' | 'pale' | 'prism';
  speedMult: number;
  chargeDamageMult: number;
  chargeDurationMs: number;
  chargeCooldownMs: number;
  chargeSpeed: number;
  chargeReach: number;
  shopPrice: number;
  description?: string;
  /** Drain while running (1 = baseline). */
  staminaDrainMult?: number;
  /** Regen while walk / stabled. */
  staminaRegenMult?: number;
  carryComfortKg?: number;
  carryMaxKg?: number;
}

export interface MountState {
  ownedId: string | null;
  mounted: boolean;
  /** ISO — до когда кулдаун тарана. */
  chargeUntil?: string | null;
  stamina: number;
  staminaAt: string | null;
}

export function emptyMountState(): MountState {
  return {
    ownedId: null,
    mounted: false,
    chargeUntil: null,
    stamina: MOUNT_STAMINA_MAX,
    staminaAt: null,
  };
}

export function normalizeMountState(raw: PlayerSave['mount'] | undefined): MountState {
  if (!raw || typeof raw !== 'object') return emptyMountState();
  const ownedId =
    typeof raw.ownedId === 'string' && raw.ownedId.length > 0 ? raw.ownedId : null;
  const mounted = Boolean(ownedId && raw.mounted);
  const chargeUntil =
    typeof raw.chargeUntil === 'string' && raw.chargeUntil.length > 0 ? raw.chargeUntil : null;
  const stamina = clampMountStamina(
    typeof raw.stamina === 'number' ? raw.stamina : MOUNT_STAMINA_MAX,
  );
  const staminaAt =
    typeof raw.staminaAt === 'string' && raw.staminaAt.length > 0 ? raw.staminaAt : null;
  return { ownedId, mounted, chargeUntil, stamina, staminaAt };
}

export function loadMounts(): MountDefinition[] {
  if (mountsList) return mountsList;
  const dir = join(contentRoot, 'mounts');
  try {
    mountsList = readdirSync(dir)
      .filter((n) => n.endsWith('.yaml'))
      .map((n) => parseYaml(readFileSync(join(dir, n), 'utf8')) as MountDefinition)
      .filter((m) => Boolean(m?.id));
  } catch {
    mountsList = [];
  }
  mountsById = new Map(mountsList.map((m) => [m.id, m]));
  return mountsList;
}

export function getMount(id: string): MountDefinition | undefined {
  loadMounts();
  return mountsById?.get(id);
}

export function clearMountsCache(): void {
  mountsList = null;
  mountsById = null;
}

export function ownedMount(save: PlayerSave): MountDefinition | undefined {
  const id = normalizeMountState(save.mount).ownedId;
  return id ? getMount(id) : undefined;
}

export function isMounted(save: PlayerSave): boolean {
  return normalizeMountState(save.mount).mounted;
}

export function saveCarryWeight(save: PlayerSave) {
  return computeCarryWeightKg({
    race: save.race,
    equipment: save.equipment ?? {},
    inventory: save.inventory ?? [],
    getItem: (id) => getItem(id),
  });
}

/** Passive regen while stabled / between sessions (no run drain). */
export function refreshMountStamina(
  save: PlayerSave,
  now = Date.now(),
  carryWeightKg?: number,
): PlayerSave {
  const mount = normalizeMountState(save.mount);
  if (!mount.ownedId) return { ...save, mount };
  const def = getMount(mount.ownedId);
  const last = mount.staminaAt ? Date.parse(mount.staminaAt) : now;
  const dtSec = Math.max(0, (now - last) / 1000);
  if (dtSec < 0.05) return { ...save, mount };
  const carry = carryWeightKg ?? saveCarryWeight(save).totalKg;
  const stamina = advanceMountStamina({
    stamina: mount.stamina,
    dtSec,
    mounted: mount.mounted,
    moving: false,
    running: false,
    horse: def ?? { speedMult: 1.4 },
    carryWeightKg: carry,
  });
  return {
    ...save,
    mount: {
      ...mount,
      stamina,
      staminaAt: new Date(now).toISOString(),
    },
  };
}

export function applyMountStaminaTick(
  save: PlayerSave,
  opts: { moving: boolean; running: boolean; chargePulse?: boolean; dtSec?: number },
  now = Date.now(),
  carryWeightKg?: number,
): PlayerSave {
  const mount = normalizeMountState(save.mount);
  if (!mount.ownedId) return { ...save, mount };
  const def = getMount(mount.ownedId);
  const last = mount.staminaAt ? Date.parse(mount.staminaAt) : now;
  const dtSec = opts.dtSec ?? Math.max(0, (now - last) / 1000);
  const carry = carryWeightKg ?? saveCarryWeight(save).totalKg;
  const stamina = advanceMountStamina({
    stamina: mount.stamina,
    dtSec,
    mounted: mount.mounted,
    moving: opts.moving,
    running: opts.running,
    horse: def ?? { speedMult: 1.4 },
    carryWeightKg: carry,
    chargePulse: opts.chargePulse,
  });
  return {
    ...save,
    mount: {
      ...mount,
      stamina,
      staminaAt: new Date(now).toISOString(),
    },
  };
}

export function setMountStamina(save: PlayerSave, stamina: number, now = Date.now()): PlayerSave {
  const mount = normalizeMountState(save.mount);
  if (!mount.ownedId) return { ...save, mount };
  return {
    ...save,
    mount: {
      ...mount,
      stamina: clampMountStamina(stamina),
      staminaAt: new Date(now).toISOString(),
    },
  };
}

export function mountedSpeedForSave(
  save: PlayerSave,
  footSpeed: number,
  carryWeightKg?: number,
): number {
  const mount = normalizeMountState(save.mount);
  if (!mount.mounted || !mount.ownedId) return footSpeed;
  const def = getMount(mount.ownedId);
  const carry = carryWeightKg ?? saveCarryWeight(save).totalKg;
  return mountedMoveSpeed(footSpeed, mount.stamina, def ?? { speedMult: 1.4 }, carry);
}

export function dismount(save: PlayerSave): PlayerSave {
  const mount = normalizeMountState(save.mount);
  if (!mount.mounted) return { ...save, mount };
  return { ...save, mount: { ...mount, mounted: false } };
}

/** Auto-dismount when entering interiors / private instances. */
export function enforceMountForLocation(
  save: PlayerSave,
  loc: { privateOwnerOnly?: boolean; dayNight?: 'outdoor' | 'indoor' | 'dungeon' } | undefined,
): PlayerSave {
  if (!loc || !locationDisallowsMount(loc)) return save;
  return dismount(save);
}

export function toggleMount(save: PlayerSave): {
  ok: boolean;
  message: string;
  save: PlayerSave;
} {
  let working = refreshMountStamina(save);
  const mount = normalizeMountState(working.mount);
  if (!mount.ownedId) {
    return { ok: false, message: 'Нет лошади. Купи у конюха Бориса.', save: { ...working, mount } };
  }
  if (!getMount(mount.ownedId)) {
    return {
      ok: false,
      message: 'Конь недоступен.',
      save: { ...working, mount: emptyMountState() },
    };
  }
  if (working.hp <= 0) {
    return { ok: false, message: 'Мёртвым не сесть.', save: { ...working, mount } };
  }
  const nextMounted = !mount.mounted;
  return {
    ok: true,
    message: nextMounted ? 'Сел на коня' : 'Спешился',
    save: { ...working, mount: { ...mount, mounted: nextMounted } },
  };
}

export function buyMount(
  save: PlayerSave,
  mountId: string,
): { ok: boolean; message: string; save: PlayerSave } {
  const def = getMount(mountId);
  if (!def) return { ok: false, message: 'Такой лошади нет.', save };
  const mount = normalizeMountState(save.mount);
  if (mount.ownedId === mountId) {
    return { ok: false, message: 'Эта лошадь уже куплена.', save: { ...save, mount } };
  }
  const adena = save.adena ?? 0;
  if (adena < def.shopPrice) {
    return {
      ok: false,
      message: `Нужно ${def.shopPrice} adena.`,
      save: { ...save, mount },
    };
  }
  const replacing = Boolean(mount.ownedId);
  return {
    ok: true,
    message: replacing ? `Заменено на: ${def.name}` : `Куплено: ${def.name}`,
    save: {
      ...save,
      adena: adena - def.shopPrice,
      mount: {
        ownedId: mountId,
        mounted: false,
        chargeUntil: mount.chargeUntil ?? null,
        stamina: MOUNT_STAMINA_MAX,
        staminaAt: new Date().toISOString(),
      },
    },
  };
}

export function isChargeReady(save: PlayerSave, now = Date.now()): boolean {
  const until = normalizeMountState(save.mount).chargeUntil;
  if (!until) return true;
  return Date.parse(until) <= now;
}

export function armChargeCooldown(save: PlayerSave, now = Date.now()): PlayerSave {
  const mount = normalizeMountState(save.mount);
  const def = mount.ownedId ? getMount(mount.ownedId) : undefined;
  if (!def) return { ...save, mount };
  return {
    ...save,
    mount: {
      ...mount,
      chargeUntil: new Date(now + def.chargeCooldownMs).toISOString(),
    },
  };
}

export function mountChargeRemainingMs(save: PlayerSave, now = Date.now()): number {
  const until = normalizeMountState(save.mount).chargeUntil;
  if (!until) return 0;
  return Math.max(0, Date.parse(until) - now);
}

export function mountStaminaOf(save: PlayerSave): number {
  return normalizeMountState(save.mount).stamina;
}

export function mountCanRunOf(save: PlayerSave): boolean {
  return mountCanRun(normalizeMountState(save.mount).stamina);
}
