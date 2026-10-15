import type { PlayerSave } from '@empery/shared';

export type SupportBuffStat =
  | 'pAtk'
  | 'pDef'
  | 'mAtk'
  | 'mDef'
  | 'critRate'
  | 'accuracy'
  | 'mpRegen'
  | 'speed'
  | 'attackSpeed';

const FLAG_PREFIX = 'buff_sup_';

function untilKey(buffId: string): string {
  return `${FLAG_PREFIX}${buffId}_until`;
}
function valKey(buffId: string): string {
  return `${FLAG_PREFIX}${buffId}_val`;
}
function statKey(buffId: string): string {
  return `${FLAG_PREFIX}${buffId}_stat`;
}
function nameKey(buffId: string): string {
  return `${FLAG_PREFIX}${buffId}_name`;
}

function flagNumber(save: PlayerSave, key: string): number {
  const v = save.questFlags[key];
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

function flagUntilMs(save: PlayerSave, key: string): number {
  const raw = save.questFlags[key];
  if (typeof raw !== 'string') return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function flagString(save: PlayerSave, key: string): string {
  const v = save.questFlags[key];
  return typeof v === 'string' ? v : '';
}

export interface AllyBuffSlice {
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  critRate: number;
  accuracy: number;
  mpRegen: number;
  speed: number;
  /** Процент ускорения атаки (снижение delay). */
  attackSpeed: number;
  remainingMs: number;
  labels: Array<{ id: string; name: string; remainingMs: number; detail?: string }>;
}

const EMPTY: AllyBuffSlice = {
  pAtk: 0,
  pDef: 0,
  mAtk: 0,
  mDef: 0,
  critRate: 0,
  accuracy: 0,
  mpRegen: 0,
  speed: 0,
  attackSpeed: 0,
  remainingMs: 0,
  labels: [],
};

/** Совместимость со старыми флагами warrior/mystic ally buffs. */
const LEGACY = [
  { until: 'buff_ally_patk_until', val: 'buff_ally_patk', stat: 'pAtk' as const, name: 'Боевой клич', id: 'ally_patk' },
  { until: 'buff_ally_pdef_until', val: 'buff_ally_pdef', stat: 'pDef' as const, name: 'Мистический щит', id: 'ally_pdef' },
  { until: 'buff_ally_mdef_until', val: 'buff_ally_mdef', stat: 'mDef' as const, name: 'Мистический щит', id: 'ally_mdef' },
];

export function getAllyBuffBonuses(save: PlayerSave, now = Date.now()): AllyBuffSlice {
  const out: AllyBuffSlice = { ...EMPTY, labels: [] };
  const seenLabel = new Set<string>();

  for (const [key, raw] of Object.entries(save.questFlags)) {
    if (!key.startsWith(FLAG_PREFIX) || !key.endsWith('_until')) continue;
    const buffId = key.slice(FLAG_PREFIX.length, -'_until'.length);
    if (!buffId) continue;
    const until = typeof raw === 'string' ? new Date(raw).getTime() : 0;
    if (!Number.isFinite(until) || until <= now) continue;
    const ms = until - now;
    const amount = flagNumber(save, valKey(buffId));
    const stat = flagString(save, statKey(buffId)) as SupportBuffStat;
    const name = flagString(save, nameKey(buffId)) || buffId;
    if (amount <= 0 || !stat) continue;
    applyStat(out, stat, amount);
    out.remainingMs = Math.max(out.remainingMs, ms);
    if (!seenLabel.has(buffId)) {
      seenLabel.add(buffId);
      out.labels.push({
        id: `sup_${buffId}`,
        name,
        remainingMs: ms,
        detail: `+${amount}`,
      });
    }
  }

  for (const leg of LEGACY) {
    const until = flagUntilMs(save, leg.until);
    if (until <= now) continue;
    const amount = flagNumber(save, leg.val);
    if (amount <= 0) continue;
    const ms = until - now;
    applyStat(out, leg.stat, amount);
    out.remainingMs = Math.max(out.remainingMs, ms);
    if (!seenLabel.has(leg.id)) {
      seenLabel.add(leg.id);
      out.labels.push({ id: leg.id, name: leg.name, remainingMs: ms, detail: `+${amount}` });
    }
  }

  return out;
}

function applyStat(out: AllyBuffSlice, stat: SupportBuffStat, amount: number): void {
  switch (stat) {
    case 'pAtk':
      out.pAtk += amount;
      break;
    case 'pDef':
      out.pDef += amount;
      break;
    case 'mAtk':
      out.mAtk += amount;
      break;
    case 'mDef':
      out.mDef += amount;
      break;
    case 'critRate':
      out.critRate += amount;
      break;
    case 'accuracy':
      out.accuracy += amount;
      break;
    case 'mpRegen':
      out.mpRegen += amount;
      break;
    case 'speed':
      out.speed += amount;
      break;
    case 'attackSpeed':
      out.attackSpeed += amount;
      break;
  }
}

export function clearExpiredAllyBuffs(save: PlayerSave, now = Date.now()): PlayerSave {
  const flags = { ...save.questFlags };
  let changed = false;

  for (const key of Object.keys(flags)) {
    if (!key.startsWith(FLAG_PREFIX) || !key.endsWith('_until')) continue;
    const until = flagUntilMs(save, key);
    if (until > now) continue;
    const buffId = key.slice(FLAG_PREFIX.length, -'_until'.length);
    delete flags[key];
    delete flags[valKey(buffId)];
    delete flags[statKey(buffId)];
    delete flags[nameKey(buffId)];
    changed = true;
  }

  for (const leg of LEGACY) {
    if (flags[leg.until] && flagUntilMs(save, leg.until) <= now) {
      delete flags[leg.until];
      delete flags[leg.val];
      changed = true;
    }
  }

  return changed ? { ...save, questFlags: flags } : save;
}

export function applyNamedBuff(
  save: PlayerSave,
  opts: {
    buffId: string;
    buffStat: SupportBuffStat;
    buffName: string;
    amount: number;
    durationMs: number;
  },
): PlayerSave {
  const duration = Math.max(1000, Math.floor(opts.durationMs));
  const until = new Date(Date.now() + duration).toISOString();
  return {
    ...save,
    questFlags: {
      ...save.questFlags,
      [untilKey(opts.buffId)]: until,
      [valKey(opts.buffId)]: Math.floor(opts.amount),
      [statKey(opts.buffId)]: opts.buffStat,
      [nameKey(opts.buffId)]: opts.buffName,
    },
  };
}

/** @deprecated legacy warrior/mystic single-stat helpers */
export function applyAllyBuffFlags(
  save: PlayerSave,
  mods: Record<string, number>,
): PlayerSave {
  let next = save;
  const duration = Math.max(1000, Math.floor(mods.buffDurationMs ?? 10000));
  if ((mods.buffPAtk ?? 0) > 0) {
    next = applyNamedBuff(next, {
      buffId: 'might',
      buffStat: 'pAtk',
      buffName: 'Мощь',
      amount: mods.buffPAtk,
      durationMs: duration,
    });
  }
  if ((mods.buffPDef ?? 0) > 0) {
    next = applyNamedBuff(next, {
      buffId: 'shield',
      buffStat: 'pDef',
      buffName: 'Щит',
      amount: mods.buffPDef,
      durationMs: duration,
    });
  }
  if ((mods.buffMDef ?? 0) > 0) {
    next = applyNamedBuff(next, {
      buffId: 'mental_shield',
      buffStat: 'mDef',
      buffName: 'Ментальный щит',
      amount: mods.buffMDef,
      durationMs: duration,
    });
  }
  return next;
}
