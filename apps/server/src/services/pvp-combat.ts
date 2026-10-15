import type { PlayerSave, PlayerStats, ComboState } from '@empery/shared';
import {
  calcMagicDamage,
  calcPhysicalDamage,
  playerDefensiveEvasion,
  rollCrit,
  rollHit,
  type CombatantStats,
} from './combat.js';
import {
  attackArc,
  attackFatigueAccuracyPenalty,
  attackFatigueDamageMult,
  comboDamageMultiplier,
  evaluateTacticGate,
  magicLevelDamageMultiplier,
  peekCombo,
  PLAYER_SKILL_MIN_STAMINA,
  pushCombo,
  rollMagicHit,
  rollMagicResistOutcome,
  tacticStrikeBonuses,
  rangedDistanceMods,
  type CombatTactic,
} from '@empery/shared';
import { computeStats, type CombatContext } from './stats.js';
import {
  getActiveSkillModifiers,
  getSkill,
  isSkillOnCooldown,
  setSkillCooldown,
} from './skills.js';
import {
  activateShieldRiposte,
  blockDamageTaken,
  consumeShieldRiposte,
  getShieldRiposte,
  shieldRiposteModifiers,
  unyieldingFullBlockChance,
} from './shield-skills.js';
import { applyKillCounters, isInnocentForPk } from './pvp.js';
import { dismount } from './mounts.js';
import {
  consumeQuiverAmmo,
  isBowEquipped,
  isStaffEquipped,
  mysticBasicAttackMpCost,
  requireRangedReady,
} from './ranged.js';
import {
  playerStaminaOf,
  refreshPlayerStamina,
  spendCombatStamina,
} from './player-stamina.js';

const pvpComboBySaveId = new Map<string, ComboState>();

function toCombatant(stats: PlayerStats, save: PlayerSave): CombatantStats {
  return {
    pAtk: stats.pAtk,
    pDef: stats.pDef,
    mAtk: stats.mAtk,
    mDef: stats.mDef,
    accuracy: stats.accuracy,
    evasion: stats.evasion,
    critRate: stats.critRate,
    level: save.level,
  };
}

function isMagicAttack(save: PlayerSave): boolean {
  return isStaffEquipped(save) || save.profession === 'mystic';
}

function effectiveMagicLevel(save: PlayerSave, skillId?: string): number {
  let level = save.level;
  if (skillId) {
    const rank = save.skillLevels[skillId] ?? 0;
    if (rank > 0) level += rank - 1;
  }
  return level;
}

export interface ResolvePvpAttackInput {
  attacker: PlayerSave;
  defender: PlayerSave;
  attackerCtx?: CombatContext;
  defenderCtx?: CombatContext;
  skillId?: string;
  /** Цель без кармы и без флага → ПК при килле. */
  victimInnocent?: boolean;
  attackerX?: number;
  attackerY?: number;
  defenderX?: number;
  defenderY?: number;
  defenderFacing?: 'left' | 'right';
}

export interface ResolvePvpAttackResult {
  attacker: PlayerSave;
  defender: PlayerSave;
  hit: boolean;
  missed: boolean;
  crit: boolean;
  blocked: boolean;
  fullyBlocked: boolean;
  damage: number;
  killed: boolean;
  skillOnCooldown?: boolean;
  insufficientMp?: boolean;
  insufficientStamina?: boolean;
  skillRequireFailed?: 'backstab' | 'execute' | 'vanish';
  backstab?: boolean;
  execute?: boolean;
  snipe?: boolean;
  vanish?: boolean;
  seek?: boolean;
  pyre?: boolean;
  arc?: 'front' | 'flank' | 'back';
  combo?: number;
  /** Жертва была без кармы → ПК. */
  wasPk: boolean;
  /** Атакующий потратил окно «Ответный удар». */
  riposteConsumed?: boolean;
  /** Защитник после блока получил окно рипоста. */
  shieldRiposteProc?: boolean;
  attackerShieldRiposteRemainingMs?: number;
  targetShieldRiposteRemainingMs?: number;
  noBow?: boolean;
  noAmmo?: boolean;
}

/**
 * Один удар игрок→игрок: формулы PvE, блок щита, скилл-моды.
 * Флаг/карма применяются снаружи (нужен runtime flag state).
 */
export function resolvePvpStrike(input: ResolvePvpAttackInput): ResolvePvpAttackResult {
  let attacker = input.attacker;
  let defender = input.defender;
  const atkCtx = input.attackerCtx ?? {};
  const defCtx = input.defenderCtx ?? {};

  if (isBowEquipped(attacker)) {
    const ready = requireRangedReady(attacker);
    if (!ready.ok) {
      return {
        attacker,
        defender,
        hit: false,
        missed: true,
        crit: false,
        blocked: false,
        fullyBlocked: false,
        damage: 0,
        killed: false,
        wasPk: false,
        noBow: ready.error === 'NO_BOW' || undefined,
        noAmmo: ready.error === 'NO_AMMO' || undefined,
      };
    }
  }

  if (input.skillId) {
    const skillLvl = attacker.skillLevels[input.skillId] ?? 0;
    if (skillLvl <= 0) {
      input = { ...input, skillId: undefined };
    } else if (isSkillOnCooldown(attacker, input.skillId)) {
      return {
        attacker,
        defender,
        hit: false,
        missed: true,
        crit: false,
        blocked: false,
        fullyBlocked: false,
        damage: 0,
        killed: false,
        skillOnCooldown: true,
        wasPk: false,
      };
    }
  }

  let accuracyBonus = 0;
  let damageMult = 1;
  let armorPen = 0;
  let critBonus = 0;

  const skillDef = input.skillId ? getSkill(input.skillId) : undefined;
  const tactic: CombatTactic | undefined = skillDef?.tactic;
  const hasGeom =
    input.attackerX !== undefined &&
    input.attackerY !== undefined &&
    input.defenderX !== undefined &&
    input.defenderY !== undefined &&
    Boolean(input.defenderFacing);
  const arc = hasGeom
    ? attackArc(
        input.attackerX!,
        input.attackerY!,
        input.defenderX!,
        input.defenderY!,
        input.defenderFacing!,
      )
    : undefined;
  const executeHpRatio = defender.hp / Math.max(1, defender.maxHp);

  if (input.skillId) {
    const gate = evaluateTacticGate({ tactic, arc, hpRatio: executeHpRatio, dashing: atkCtx.dashing });
    if (!gate.ok) {
      return {
        attacker,
        defender,
        hit: false,
        missed: true,
        crit: false,
        blocked: false,
        fullyBlocked: false,
        damage: 0,
        killed: false,
        skillRequireFailed: gate.fail,
        wasPk: false,
        arc,
      };
    }
    attacker = refreshPlayerStamina(attacker);
    if (playerStaminaOf(attacker) < PLAYER_SKILL_MIN_STAMINA) {
      return {
        attacker,
        defender,
        hit: false,
        missed: true,
        crit: false,
        blocked: false,
        fullyBlocked: false,
        damage: 0,
        killed: false,
        insufficientStamina: true,
        wasPk: false,
      };
    }
  }

  if (input.skillId) {
    const mods = getActiveSkillModifiers(attacker, input.skillId);
    const mpCost = Math.max(0, Math.floor(mods.mpCost ?? 0));
    if (mpCost > 0 && (attacker.mp ?? 0) < mpCost) {
      return {
        attacker,
        defender,
        hit: false,
        missed: true,
        crit: false,
        blocked: false,
        fullyBlocked: false,
        damage: 0,
        killed: false,
        insufficientMp: true,
        wasPk: false,
      };
    }
    damageMult = mods.damageMultiplier ?? 1;
    armorPen = mods.armorPenetration ?? 0;
    critBonus = mods.critBonus ?? 0;
    accuracyBonus = mods.accuracyBonus ?? 0;
    if (mpCost > 0) {
      attacker = { ...attacker, mp: Math.max(0, (attacker.mp ?? 0) - mpCost) };
    }
    attacker = setSkillCooldown(attacker, input.skillId);
  } else {
    const basicMp = mysticBasicAttackMpCost(attacker);
    if (basicMp > 0) {
      if ((attacker.mp ?? 0) < basicMp) {
        return {
          attacker,
          defender,
          hit: false,
          missed: true,
          crit: false,
          blocked: false,
          fullyBlocked: false,
          damage: 0,
          killed: false,
          insufficientMp: true,
          wasPk: false,
        };
      }
      attacker = {
        ...attacker,
        mp: Math.max(0, (attacker.mp ?? 0) - basicMp),
      };
    }
  }

  if (isBowEquipped(attacker)) {
    const spent = consumeQuiverAmmo(attacker);
    if (!spent.ok) {
      return {
        attacker,
        defender,
        hit: false,
        missed: true,
        crit: false,
        blocked: false,
        fullyBlocked: false,
        damage: 0,
        killed: false,
        wasPk: false,
        noAmmo: true,
      };
    }
    attacker = spent.save;
  }

  const atkStats = computeStats(attacker, atkCtx);
  const defStats = computeStats(defender, defCtx);
  const atk = toCombatant(atkStats, attacker);
  const def = toCombatant(defStats, defender);
  const defEva = playerDefensiveEvasion(defStats, defCtx);

  const pendingRiposte = getShieldRiposte(attacker);
  const pendingRank = pendingRiposte.active
    ? (attacker.skillLevels.shield_riposte ?? 0)
    : 0;
  if (pendingRiposte.active && pendingRank > 0) {
    accuracyBonus += shieldRiposteModifiers(pendingRank).accuracy;
  }

  const now = Date.now();
  const prevCombo = pvpComboBySaveId.get(attacker.id);
  const comboCount = peekCombo(prevCombo, now) + 1;
  const magic = isMagicAttack(attacker);
  const positional = !magic && !isBowEquipped(attacker) && arc !== undefined;
  const dist =
    input.attackerX !== undefined &&
    input.attackerY !== undefined &&
    input.defenderX !== undefined &&
    input.defenderY !== undefined
      ? Math.hypot(input.attackerX - input.defenderX, input.attackerY - input.defenderY)
      : undefined;
  const bonuses = tacticStrikeBonuses({
    tactic,
    arc: arc ?? 'front',
    positional,
    distance: dist,
    rangeBias: skillDef?.rangeBias,
  });
  damageMult *= bonuses.damageMult;
  accuracyBonus += bonuses.accuracy;
  critBonus += bonuses.critBonus;
  if (isBowEquipped(attacker) && dist !== undefined) {
    const falloff = rangedDistanceMods(dist);
    damageMult *= falloff.damageMult;
    accuracyBonus += falloff.accuracy;
  }
  damageMult *= comboDamageMultiplier(comboCount);
  attacker = spendCombatStamina(attacker, Boolean(input.skillId), now);
  const stamNow = playerStaminaOf(attacker);
  accuracyBonus -= attackFatigueAccuracyPenalty(stamNow);
  damageMult *= attackFatigueDamageMult(stamNow);

  const magicLevel = effectiveMagicLevel(attacker, input.skillId);
  const hit = bonuses.seek
    ? true
    : magic
      ? rollMagicHit(magicLevel, def.level, atk.accuracy + accuracyBonus)
      : rollHit(atk.accuracy + accuracyBonus, defEva, false);
  if (!hit) {
    pvpComboBySaveId.set(attacker.id, pushCombo(prevCombo, now, false));
    return {
      attacker,
      defender,
      hit: false,
      missed: true,
      crit: false,
      blocked: false,
      fullyBlocked: false,
      damage: 0,
      killed: false,
      wasPk: false,
      attackerShieldRiposteRemainingMs: pendingRiposte.remainingMs || undefined,
      combo: 0,
    };
  }

  let riposteConsumed = false;
  if (pendingRiposte.active) {
    const riposte = consumeShieldRiposte(attacker);
    attacker = riposte.save;
    riposteConsumed = riposte.consumed;
    if (riposte.consumed) {
      damageMult *= shieldRiposteModifiers(riposte.rank).damageMult;
    }
  }

  const crit = bonuses.guaranteedCrit || rollCrit(atk.critRate, critBonus);
  const dmgOpts = {
    damageMultiplier: damageMult,
    armorPenetration: armorPen,
    crit,
  };
  const damageRaw = magic
    ? calcMagicDamage(atk, def, dmgOpts)
    : calcPhysicalDamage(atk, def, dmgOpts);

  // Магию щитом не блокируем (как в L2 — блок от физ. ударов)
  const blockRoll = magic ? 0 : (defStats.blockChance ?? 0) / 100;
  const blocked = blockRoll > 0 && Math.random() < blockRoll;
  const hpRatio = defender.hp / Math.max(1, defStats.maxHp);
  const fullyBlocked =
    blocked && Math.random() < unyieldingFullBlockChance(defender, hpRatio);
  let damage = damageRaw;
  if (magic) {
    const resist = rollMagicResistOutcome(magicLevel, def.level);
    if (resist === 'full') {
      return {
        attacker,
        defender,
        hit: false,
        missed: true,
        crit: false,
        blocked: false,
        fullyBlocked: false,
        damage: 0,
        killed: false,
        wasPk: false,
        attackerShieldRiposteRemainingMs: pendingRiposte.remainingMs || undefined,
      };
    }
    damage = Math.floor(damage * magicLevelDamageMultiplier(magicLevel, def.level));
    if (resist === 'half') damage = Math.max(1, Math.floor(damage / 2));
  }
  if (fullyBlocked) {
    damage = 0;
  } else if (blocked) {
    damage = Math.max(1, Math.floor(damageRaw * blockDamageTaken(defender)));
  }

  let nextDef = { ...defender, hp: Math.max(0, defender.hp - damage) };
  let riposteProc = false;
  if (blocked) {
    const armed = activateShieldRiposte(nextDef);
    riposteProc = armed !== nextDef;
    nextDef = armed;
  }

  const killed = nextDef.hp <= 0;
  if (killed) {
    nextDef = dismount(nextDef);
  }
  const wasPk = killed && Boolean(input.victimInnocent ?? isInnocentForPk(defender.karma ?? 0, 0));
  let nextAtk = attacker;
  if (killed) {
    nextAtk = applyKillCounters(attacker, defender, { victimInnocent: wasPk });
  }

  const atkRiposte = getShieldRiposte(nextAtk);
  const defRiposte = getShieldRiposte(nextDef);
  const comboState = pushCombo(prevCombo, now, true);
  pvpComboBySaveId.set(nextAtk.id, comboState);

  return {
    attacker: nextAtk,
    defender: nextDef,
    hit: true,
    missed: false,
    crit,
    blocked,
    fullyBlocked,
    damage,
    killed,
    wasPk,
    riposteConsumed: riposteConsumed || undefined,
    shieldRiposteProc: riposteProc || undefined,
    attackerShieldRiposteRemainingMs: atkRiposte.remainingMs || undefined,
    targetShieldRiposteRemainingMs: defRiposte.remainingMs || undefined,
    backstab: bonuses.backstab || undefined,
    execute: bonuses.execute || undefined,
    snipe: bonuses.snipe || undefined,
    vanish: bonuses.vanish || undefined,
    seek: bonuses.seek || undefined,
    pyre: bonuses.pyre || undefined,
    arc,
    combo: comboState.count,
  };
}
