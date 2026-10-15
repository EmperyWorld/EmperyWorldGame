import type { PlayerSave, SkillDefinition } from '@empery/shared';
import { applyStatsToSave, computeStats } from './stats.js';
import {
  getActiveSkillModifiers,
  getSkill,
  isSkillOnCooldown,
  setSkillCooldown,
  computeSkillBonuses,
} from './skills.js';
import { grantXp, XP_SKILL_ACTIVE_HIT } from './progression.js';
import {
  applyAllyBuffFlags,
  applyNamedBuff,
  clearExpiredAllyBuffs,
  type SupportBuffStat,
} from './ally-buffs.js';

export function isSupportCastSkill(skill: SkillDefinition | undefined): boolean {
  if (!skill || skill.type !== 'active') return false;
  return skill.targetMode === 'ally' || skill.targetMode === 'party';
}

export function isAllyTargetSkill(skill: SkillDefinition | undefined): boolean {
  return isSupportCastSkill(skill);
}

export function isAllyTargetSkillId(skillId: string | undefined): boolean {
  if (!skillId) return false;
  return isSupportCastSkill(getSkill(skillId));
}

export type AllyCastReject =
  | 'NOT_ALLY_SKILL'
  | 'NOT_LEARNED'
  | 'WRONG_RACE'
  | 'COOLDOWN'
  | 'NO_MP'
  | 'CASTER_DEAD'
  | 'TARGET_DEAD'
  | 'TARGET_NOT_FOUND'
  | 'NOT_PARTY'
  | 'OTHER_LOCATION'
  | 'OUT_OF_RANGE'
  | 'NO_EFFECT'
  | 'NO_TARGETS';

const REJECT_RU: Record<AllyCastReject, string> = {
  NOT_ALLY_SKILL: 'Это не союзный навык',
  NOT_LEARNED: 'Навык не изучен',
  WRONG_RACE: 'Навык другой расы',
  COOLDOWN: 'Скилл на перезарядке',
  NO_MP: 'Не хватает MP',
  CASTER_DEAD: 'Мёртвым не помочь',
  TARGET_DEAD: 'Цель мертва',
  TARGET_NOT_FOUND: 'Цель не найдена',
  NOT_PARTY: 'Только союзник из пати или ты сам',
  OTHER_LOCATION: 'Цель в другой локации',
  OUT_OF_RANGE: 'Подойди ближе',
  NO_EFFECT: 'Нет эффекта',
  NO_TARGETS: 'Нет целей в радиусе',
};

export function allyCastRejectMessage(code: AllyCastReject): string {
  return REJECT_RU[code];
}

export interface SupportTargetInput {
  save: PlayerSave;
  distance: number;
  sameLocation: boolean;
  sameParty: boolean;
}

export interface SupportTargetResult {
  save: PlayerSave;
  healAmount: number;
  mpAmount: number;
  hpDelta: number;
  buffApplied: boolean;
}

export interface AllyCastOk {
  ok: true;
  caster: PlayerSave;
  target: PlayerSave;
  targets: SupportTargetResult[];
  skillId: string;
  skillName: string;
  healAmount: number;
  buffApplied: boolean;
  casterXpGained?: number;
}

export interface AllyCastErr {
  ok: false;
  code: AllyCastReject;
  error: string;
  caster?: PlayerSave;
}

export interface AllyCastContext {
  sameParty: boolean;
  sameLocation: boolean;
  distance: number;
  range: number;
}

/** Выровнять HP: сумма / n, остаток по +1. */
export function balancePartyHp(members: PlayerSave[]): PlayerSave[] {
  const living = members.filter((m) => m.hp > 0);
  if (living.length === 0) return members;
  const sum = living.reduce((a, m) => a + m.hp, 0);
  const n = living.length;
  const share = Math.floor(sum / n);
  let rem = sum - share * n;
  const byId = new Map(members.map((m) => [m.id, { ...m }]));
  for (const m of living) {
    const next = byId.get(m.id)!;
    let hp = Math.min(next.maxHp, share);
    if (rem > 0 && hp < next.maxHp) {
      hp += 1;
      rem -= 1;
    }
    next.hp = Math.max(1, Math.min(next.maxHp, hp));
    byId.set(m.id, next);
  }
  return members.map((m) => byId.get(m.id) ?? m);
}

function applyEffectsToTarget(
  casterStats: { mAtk: number },
  power: { healPowerPct: number; mpRestorePct: number; buffPowerPct: number },
  target: PlayerSave,
  skill: SkillDefinition,
  mods: Record<string, number>,
): SupportTargetResult {
  let next = clearExpiredAllyBuffs(target);
  let healAmount = 0;
  let mpAmount = 0;
  let buffApplied = false;
  const hpBefore = next.hp;

  const healFlat = Math.max(0, mods.healFlat ?? 0);
  const healScale = Math.max(0, mods.healMAtkScale ?? 0);
  if (healFlat > 0 || healScale > 0) {
    const base = healFlat + casterStats.mAtk * healScale;
    const raw = Math.max(1, Math.floor(base * (1 + power.healPowerPct / 100)));
    const before = next.hp;
    next = { ...next, hp: Math.min(next.maxHp, next.hp + raw) };
    healAmount = Math.max(0, next.hp - before);
  }

  const mpFlat = Math.max(0, mods.mpFlat ?? 0);
  const mpScale = Math.max(0, mods.mpMAtkScale ?? 0);
  if (mpFlat > 0 || mpScale > 0) {
    const base = mpFlat + casterStats.mAtk * mpScale;
    const raw = Math.max(1, Math.floor(base * (1 + power.mpRestorePct / 100)));
    const before = next.mp ?? 0;
    const maxMp = next.maxMp ?? before;
    next = { ...next, mp: Math.min(maxMp, before + raw) };
    mpAmount = Math.max(0, (next.mp ?? 0) - before);
  }

  const buffAmount = Math.max(0, mods.buffAmount ?? 0);
  const buffDuration = Math.max(0, mods.buffDurationMs ?? 0);
  if (skill.buffId && skill.buffStat && buffAmount > 0 && buffDuration > 0) {
    const amount = Math.max(1, Math.floor(buffAmount * (1 + power.buffPowerPct / 100)));
    next = applyNamedBuff(next, {
      buffId: skill.buffId,
      buffStat: skill.buffStat as SupportBuffStat,
      buffName: skill.buffName ?? skill.buffId,
      amount,
      durationMs: buffDuration,
    });
    buffApplied = true;
  }

  if ((mods.buffPAtk ?? 0) > 0 || (mods.buffPDef ?? 0) > 0 || (mods.buffMDef ?? 0) > 0) {
    const scaled = {
      ...mods,
      buffPAtk: Math.floor((mods.buffPAtk ?? 0) * (1 + power.buffPowerPct / 100)),
      buffPDef: Math.floor((mods.buffPDef ?? 0) * (1 + power.buffPowerPct / 100)),
      buffMDef: Math.floor((mods.buffMDef ?? 0) * (1 + power.buffPowerPct / 100)),
    };
    next = applyAllyBuffFlags(next, scaled);
    buffApplied = true;
  }

  return {
    save: next,
    healAmount,
    mpAmount,
    hpDelta: next.hp - hpBefore,
    buffApplied,
  };
}

export function resolveSupportCastWithRange(
  caster: PlayerSave,
  skillId: string,
  candidates: SupportTargetInput[],
  opts: { primaryTargetId?: string | null; range: number },
): AllyCastOk | AllyCastErr {
  const skill = getSkill(skillId);
  if (!isSupportCastSkill(skill)) {
    return { ok: false, code: 'NOT_ALLY_SKILL', error: allyCastRejectMessage('NOT_ALLY_SKILL') };
  }
  if (skill!.race && skill!.race !== caster.race) {
    return { ok: false, code: 'WRONG_RACE', error: allyCastRejectMessage('WRONG_RACE') };
  }
  const rank = caster.skillLevels[skillId] ?? 0;
  if (rank <= 0) {
    return { ok: false, code: 'NOT_LEARNED', error: allyCastRejectMessage('NOT_LEARNED') };
  }
  if (caster.hp <= 0) {
    return { ok: false, code: 'CASTER_DEAD', error: allyCastRejectMessage('CASTER_DEAD') };
  }
  if (isSkillOnCooldown(caster, skillId)) {
    return { ok: false, code: 'COOLDOWN', error: allyCastRejectMessage('COOLDOWN'), caster };
  }

  const mods = getActiveSkillModifiers(caster, skillId);
  const mpCost = Math.max(0, Math.floor(mods.mpCost ?? 0));
  let nextCaster = applyStatsToSave(clearExpiredAllyBuffs(caster));
  const casterStats = computeStats(nextCaster);
  const skillPower = computeSkillBonuses(nextCaster);
  const power = {
    healPowerPct: skillPower.healPowerPct,
    mpRestorePct: skillPower.mpRestorePct,
    buffPowerPct: skillPower.buffPowerPct,
  };
  if (mpCost > 0 && (nextCaster.mp ?? 0) < mpCost) {
    return { ok: false, code: 'NO_MP', error: allyCastRejectMessage('NO_MP'), caster: nextCaster };
  }

  const mode = skill!.targetMode ?? 'ally';
  const maxRange = opts.range;

  let selected: SupportTargetInput[] = [];
  if (mode === 'party') {
    selected = candidates.filter(
      (c) =>
        c.save.hp > 0 &&
        c.distance <= maxRange &&
        (c.save.id === nextCaster.id || (c.sameParty && c.sameLocation)),
    );
  } else {
    const tid = opts.primaryTargetId ?? nextCaster.id;
    const hit = candidates.find((c) => c.save.id === tid);
    if (!hit) {
      return { ok: false, code: 'TARGET_NOT_FOUND', error: allyCastRejectMessage('TARGET_NOT_FOUND') };
    }
    if (hit.save.hp <= 0) {
      return { ok: false, code: 'TARGET_DEAD', error: allyCastRejectMessage('TARGET_DEAD') };
    }
    if (hit.save.id !== nextCaster.id) {
      if (!hit.sameParty) {
        return { ok: false, code: 'NOT_PARTY', error: allyCastRejectMessage('NOT_PARTY') };
      }
      if (!hit.sameLocation) {
        return { ok: false, code: 'OTHER_LOCATION', error: allyCastRejectMessage('OTHER_LOCATION') };
      }
      if (hit.distance > maxRange) {
        return { ok: false, code: 'OUT_OF_RANGE', error: allyCastRejectMessage('OUT_OF_RANGE') };
      }
    }
    selected = [hit];
  }

  if (selected.length === 0) {
    return { ok: false, code: 'NO_TARGETS', error: allyCastRejectMessage('NO_TARGETS') };
  }

  if (mpCost > 0) {
    nextCaster = {
      ...nextCaster,
      mp: Math.max(0, (nextCaster.mp ?? 0) - mpCost),
    };
  }

  const working = selected.map((c) =>
    c.save.id === nextCaster.id ? { ...c, save: { ...nextCaster } } : c,
  );

  let results: SupportTargetResult[];
  if (skill!.effect === 'balance') {
    const beforeHps = working.map((w) => w.save.hp);
    const balanced = balancePartyHp(working.map((w) => w.save));
    results = balanced.map((s, i) => {
      const delta = s.hp - beforeHps[i]!;
      return {
        save: s,
        healAmount: Math.max(0, delta),
        mpAmount: 0,
        hpDelta: delta,
        buffApplied: false,
      };
    });
  } else {
    results = working.map((w) =>
      applyEffectsToTarget(casterStats, power, w.save, skill!, mods),
    );
  }

  // Sync caster row with spent mp
  results = results.map((r) => {
    if (r.save.id !== nextCaster.id) return r;
    return {
      ...r,
      save: { ...r.save, mp: nextCaster.mp, skillCooldowns: nextCaster.skillCooldowns },
    };
  });

  let casterRow = results.find((r) => r.save.id === nextCaster.id)?.save ?? nextCaster;
  casterRow = setSkillCooldown(casterRow, skillId);
  const xp = grantXp(casterRow, XP_SKILL_ACTIVE_HIT);
  casterRow = xp.save;

  results = results.map((r) =>
    r.save.id === casterRow.id
      ? {
          ...r,
          save: {
            ...casterRow,
            hp: r.save.hp,
            questFlags: r.save.questFlags,
          },
        }
      : r,
  );
  nextCaster = results.find((r) => r.save.id === caster.id)?.save ?? casterRow;
  nextCaster = applyStatsToSave(nextCaster);

  results = results.map((r) => ({
    ...r,
    save: r.save.id === nextCaster.id ? nextCaster : applyStatsToSave(r.save),
  }));

  const anyHeal = results.some((r) => r.healAmount > 0 || r.mpAmount > 0);
  const anyBuff = results.some((r) => r.buffApplied);
  const isBalance = skill!.effect === 'balance';
  if (!anyHeal && !anyBuff && !isBalance) {
    return { ok: false, code: 'NO_EFFECT', error: allyCastRejectMessage('NO_EFFECT') };
  }

  const primary = results.find((r) => r.save.id === (opts.primaryTargetId ?? nextCaster.id)) ?? results[0]!;
  return {
    ok: true,
    caster: nextCaster,
    target: primary.save,
    targets: results,
    skillId,
    skillName: skill!.name,
    healAmount: results.reduce((a, r) => a + r.healAmount, 0),
    buffApplied: anyBuff || isBalance,
    casterXpGained: xp.xpGained,
  };
}

export function resolveAllyCast(
  caster: PlayerSave,
  target: PlayerSave,
  skillId: string,
  ctx: AllyCastContext,
): AllyCastOk | AllyCastErr {
  const candidates: SupportTargetInput[] = [
    { save: caster, distance: 0, sameLocation: true, sameParty: true },
  ];
  if (target.id !== caster.id) {
    candidates.push({
      save: target,
      distance: ctx.distance,
      sameLocation: ctx.sameLocation,
      sameParty: ctx.sameParty,
    });
  }
  return resolveSupportCastWithRange(caster, skillId, candidates, {
    primaryTargetId: target.id,
    range: ctx.range,
  });
}
