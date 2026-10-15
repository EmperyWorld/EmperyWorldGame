/**
 * Боевые формулы в духе Lineage 2 (упрощённо).
 * Hit: chance = clamp((80 + 2*(acc - eva)) * 10, min, 980) / 1000
 * При защите игрока min=0 → возможен 100% уворот при высоком evasion.
 * Damage: (pAtk * 70) / (pDef + 50)
 * Magic damage: (91 * Power * √mAtk) / mDef
 * Magic hit: success ≈ 1 / 1.3^Δlvl (см. magic-combat.ts)
 */
import type { PlayerSave, PlayerStats } from '@empery/shared';
import {
  levelAdvantage,
  mobDifficulty,
  difficultyLabel,
  magicLevelDamageMultiplier,
  rollMagicHit,
  rollMagicResistOutcome,
  attackArc,
  comboDamageMultiplier,
  CLEAVE_SPLASH_MULT,
  PLAYER_SKILL_MIN_STAMINA,
  attackFatigueAccuracyPenalty,
  attackFatigueDamageMult,
  evaluateTacticGate,
  tacticStrikeBonuses,
  poisonDot,
  rangedDistanceMods,
  resolveSkillControl,
  type AttackArc,
  type CombatControlKind,
  type CombatTactic,
  type SkillTacticFail,
} from '@empery/shared';
import { getScaledEnemy, getEnemy } from './enemies.js';
import { computeStats, computeOffhandStrikePAtk, type CombatContext } from './stats.js';
import {
  getActiveSkillModifiers,
  getSkill,
  isSkillOnCooldown,
  setSkillCooldown,
} from './skills.js';
import {
  grantPerfectDodgeStamina,
  playerStaminaOf,
  refreshPlayerStamina,
  spendCombatStamina,
} from './player-stamina.js';
import type { QuestService } from './quests.js';
import { getQuest, radioNpcForQuest } from './quests.js';
import { grantCombatXp, grantXp, XP_SKILL_ACTIVE_CRIT_BONUS, XP_SKILL_ACTIVE_HIT, XP_SKILL_DODGE, XP_SKILL_PERFECT_DODGE } from './progression.js';
import { rollEnemyDrops, type DropRoll } from './drops.js';
import type { DropRollResult } from '@empery/shared';
import { dismount } from './mounts.js';
import {
  calcBleedTickDamage,
  getSwarmFrenzy,
  tryProcSwarmFrenzy,
} from './swarm-frenzy.js';
import {
  getMadDualist,
  tryProcMadDualist,
} from './mad-dualist.js';
import { worldEvents } from './world-events.js';
import {
  activateShieldRiposte,
  blockDamageTaken,
  consumeShieldRiposte,
  getShieldRiposte,
  hasShieldEquipped,
  shieldRiposteModifiers,
  unyieldingFullBlockChance,
} from './shield-skills.js';
import { decayKarmaOnMobKill } from './pvp.js';
import {
  consumeQuiverAmmo,
  isBowEquipped,
  isStaffEquipped,
  mysticBasicAttackMpCost,
  requireRangedReady,
} from './ranged.js';
import { canRadioTalk } from './radio.js';

export interface CombatantStats {
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  accuracy: number;
  evasion: number;
  critRate: number;
  level: number;
}

/** Evasion с учётом бездействия и контратаки (L2: стоя на месте / окно удара) */
export function playerDefensiveEvasion(
  stats: PlayerStats,
  ctx: CombatContext & { counterAttack?: boolean },
): number {
  let eva = stats.evasion;

  const idle = !ctx.moving && !ctx.dashing;
  if (idle) {
    const mastery = stats.evasion + stats.dex * 2;
    eva += Math.floor(mastery * 0.45);
    eva += stats.evasionWhileIdle ?? 0;
  }

  if (ctx.counterAttack) {
    const mastery = stats.evasion + stats.dex;
    eva += Math.floor(mastery * 0.6) + 30;
  }

  return eva;
}

export function calcHitChance(
  attackerAcc: number,
  defenderEva: number,
  allowFullDodge = false,
): number {
  const raw = (80 + 2 * (attackerAcc - defenderEva)) * 10;
  const minHit = allowFullDodge ? 0 : 200;
  const clamped = Math.max(minHit, Math.min(980, raw));
  return clamped / 1000;
}

export function rollHit(
  attackerAcc: number,
  defenderEva: number,
  allowFullDodge = false,
): boolean {
  return Math.random() < calcHitChance(attackerAcc, defenderEva, allowFullDodge);
}

export function calcPhysicalDamage(
  attacker: CombatantStats,
  defender: CombatantStats,
  opts?: { damageMultiplier?: number; armorPenetration?: number; crit?: boolean },
): number {
  const mult = opts?.damageMultiplier ?? 1;
  const pen = opts?.armorPenetration ?? 0;
  const effectiveDef = defender.pDef * (1 - pen);
  let dmg = (attacker.pAtk * 70) / Math.max(effectiveDef + 50, 1);
  dmg *= mult;
  if (opts?.crit) dmg *= 2;
  return Math.max(1, Math.floor(dmg));
}

/** L2: ~91 × Power × √M.Atk / M.Def */
export function calcMagicDamage(
  attacker: CombatantStats,
  defender: CombatantStats,
  opts?: { damageMultiplier?: number; armorPenetration?: number; crit?: boolean },
): number {
  const power = opts?.damageMultiplier ?? 1;
  const pen = opts?.armorPenetration ?? 0;
  const effectiveMDef = Math.max(1, defender.mDef * (1 - pen));
  let dmg = (91 * power * Math.sqrt(Math.max(1, attacker.mAtk))) / effectiveMDef;
  if (opts?.crit) dmg *= 2;
  return Math.max(1, Math.floor(dmg));
}

export function rollCrit(critRate: number, bonus = 0): boolean {
  return Math.random() * 100 < critRate + bonus;
}

function isMagicAttack(save: PlayerSave): boolean {
  return isStaffEquipped(save) || save.profession === 'mystic';
}

/** Уровень для проверки магии: ранг скилла слегка «подтягивает» эффективный lvl. */
function effectiveMagicLevel(save: PlayerSave, skillId?: string): number {
  let level = save.level;
  if (skillId) {
    const rank = save.skillLevels[skillId] ?? 0;
    if (rank > 0) level += rank - 1;
  }
  return level;
}

function playerCombatant(stats: PlayerStats, save: PlayerSave): CombatantStats {
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

function enemyCombatant(enemyType: string, enemyLevel: number): CombatantStats {
  const e = getScaledEnemy(enemyType, enemyLevel);
  if (!e) {
    return {
      pAtk: 10,
      pDef: 10,
      mAtk: 5,
      mDef: 9,
      accuracy: 20,
      evasion: 15,
      critRate: 5,
      level: enemyLevel,
    };
  }
  return {
    pAtk: e.pAtk,
    pDef: e.pDef,
    mAtk: Math.max(1, Math.floor(e.pAtk * 0.4)),
    mDef: e.mDef,
    accuracy: e.accuracy,
    evasion: e.evasion,
    critRate: 8,
    level: e.level,
  };
}

function resolveEnemyLevel(enemyType: string, enemyLevel?: number): number {
  if (enemyLevel !== undefined && enemyLevel > 0) return enemyLevel;
  return getEnemy(enemyType)?.level ?? 1;
}

function toDropRollResult(drop: DropRoll): DropRollResult {
  return {
    kind: drop.kind,
    itemId: drop.itemId,
    count: drop.count,
  };
}

function formatDropSummary(drops: DropRollResult[] | undefined): string | undefined {
  if (!drops?.length) return undefined;
  return drops
    .map((d) => (d.kind === 'adena' ? `${d.count} adena` : `${d.itemId}×${d.count}`))
    .join(', ');
}

/** Rewards are issued by the encounter alive → dead transition, including server DOT. */
export function rewardEnemyKill(save: PlayerSave, enemyType: string, lvl: number, quests: QuestService, questId?: string, ctx: { partyShareCount?: number } = {}) {
  let nextSave = save;
  let questCompleted: boolean | undefined;
  let lootAdded: string | undefined;
  let drops: DropRollResult[] | undefined;
  let xpGained: number | undefined;
  let leveledUp: boolean | undefined;
  let radioIncoming: { npcId: string } | undefined;
  let skillsUnlocked: string[] | undefined;
  let xpMult: number | undefined;
    const questCfg = questId ? getQuest(questId) : undefined;
    const completeFlag = questCfg?.completeFlag;
    const beforeComplete = completeFlag ? Boolean(nextSave.questFlags[completeFlag]) : false;

    // Drops spawn on the ground — do not auto-inventory.
    const rolled = rollEnemyDrops(enemyType, nextSave.level, lvl);
    drops = rolled.map(toDropRollResult);

    const xpResult = grantCombatXp(nextSave, enemyType, lvl, {
      shareCount: ctx.partyShareCount,
    });
    nextSave = decayKarmaOnMobKill(xpResult.save);
    xpMult = xpResult.xpMultiplier;
    xpGained = (xpGained ?? 0) + xpResult.xpGained;
    leveledUp = leveledUp || xpResult.leveledUp;
    if (xpResult.skillsUnlocked.length) {
      skillsUnlocked = [...(skillsUnlocked ?? []), ...xpResult.skillsUnlocked];
    }

    if (questId) {
      nextSave = quests.onEnemyDefeated(nextSave, questId, enemyType);
    }
    if (nextSave.questFlags.quest_board_bounty_active) {
      const bKills = Number(nextSave.questFlags.quest_board_bounty_kills ?? 0) + 1;
      nextSave = {
        ...nextSave,
        questFlags: {
          ...nextSave.questFlags,
          quest_board_bounty_kills: bKills,
        },
      };
    }

    lootAdded = formatDropSummary(drops);
    if (completeFlag) {
      questCompleted = !beforeComplete && Boolean(nextSave.questFlags[completeFlag]);
    }
    if (questCompleted && questId) {
      const npcId = radioNpcForQuest(questId);
      if (npcId) {
        // Входящий звонок всегда; условия рации проверяются при ответе.
        const gate = canRadioTalk(nextSave, npcId);
        nextSave = gate.save;
        radioIncoming = { npcId };
      }
    }

    const enemyName = getEnemy(enemyType)?.name ?? enemyType;
    void worldEvents.publish({
      type: 'PLAYER_ACTION',
      action: 'COMBAT',
      playerId: nextSave.id,
      locationId: nextSave.location,
      payload: { enemyType, enemyName },
      timestamp: Date.now(),
    });

  return { save: nextSave, questCompleted, lootAdded, drops, xpGained, leveledUp, radioIncoming, skillsUnlocked, xpMultiplier: xpMult };
}

export type PlayerAttackContext = CombatContext & {
  skillId?: string;
  enemyLevel?: number;
  partyShareCount?: number;
  /** Уже списали стрелу на уровне batch. */
  skipAmmoConsume?: boolean;
  playerX?: number;
  playerY?: number;
  enemyX?: number;
  enemyY?: number;
  enemyFacing?: 'left' | 'right';
  enemyMaxHp?: number;
  /** Повторный хит cleave: моды скилла без повторного MP/CD/stamina. */
  skillFollowUp?: boolean;
  cleaveSplash?: boolean;
  comboCount?: number;
  skipStaminaConsume?: boolean;
  /** Цель уже под меткой этого игрока. */
  marked?: boolean;
};

export function resolvePlayerAttack(
  save: PlayerSave,
  enemyType: string,
  enemyHp: number,
  ctx: PlayerAttackContext,
  quests: QuestService,
  questId?: string,
): {
  hit: boolean;
  missed: boolean;
  crit: boolean;
  damage: number;
  enemyHp: number;
  killed: boolean;
  save: PlayerSave;
  stats: PlayerStats;
  questCompleted?: boolean;
  lootAdded?: string;
  drops?: DropRollResult[];
  xpGained?: number;
  skillXpGained?: number;
  leveledUp?: boolean;
  enemyLevel?: number;
  levelAdvantage?: number;
  mobDifficulty?: string;
  xpMultiplier?: number;
  skillOnCooldown?: boolean;
  insufficientMp?: boolean;
  insufficientStamina?: boolean;
  skillRequireFailed?: SkillTacticFail;
  skillsUnlocked?: string[];
  swarmFrenzyProc?: boolean;
  swarmFrenzyActive?: boolean;
  swarmFrenzyEnemies?: number;
  swarmFrenzyRemainingMs?: number;
  madDualistProc?: boolean;
  madDualistActive?: boolean;
  madDualistRemainingMs?: number;
  offhandHit?: boolean;
  offhandCrit?: boolean;
  offhandDamage?: number;
  bleed?: { tickDamage: number; durationMs: number; tickMs: number; kind?: 'bleed' | 'poison' };
  /** Входящий вызов по рации после квеста (если связь доступна). */
  radioIncoming?: { npcId: string };
  shieldRiposteConsumed?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
  noBow?: boolean;
  noAmmo?: boolean;
  backstab?: boolean;
  execute?: boolean;
  snipe?: boolean;
  marked?: boolean;
  markApplied?: boolean;
  vanish?: boolean;
  seek?: boolean;
  pyre?: boolean;
  controlApplied?: CombatControlKind;
  arc?: AttackArc;
  cleaveSplash?: boolean;
  combo?: number;
} {
  let nextSave = save;
  const nearby = ctx.nearbyEnemyCount ?? 0;
  const proc = tryProcSwarmFrenzy(nextSave, nearby);
  nextSave = proc.save;
  const dualProc = tryProcMadDualist(nextSave, { isSkillAttack: Boolean(ctx.skillId) });
  nextSave = dualProc.save;
  const frenzy = getSwarmFrenzy(nextSave);
  const dual = getMadDualist(nextSave);

  if (isBowEquipped(nextSave)) {
    const ready = requireRangedReady(nextSave);
    if (!ready.ok) {
      return {
        hit: false,
        missed: true,
        crit: false,
        damage: 0,
        enemyHp,
        killed: false,
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        noBow: ready.error === 'NO_BOW' || undefined,
        noAmmo: ready.error === 'NO_AMMO' || undefined,
      };
    }
  }

  const lvl = resolveEnemyLevel(enemyType, ctx.enemyLevel);
  const adv = levelAdvantage(nextSave.level, lvl);
  const diff = mobDifficulty(nextSave.level, lvl);
  const stats = computeStats(nextSave, ctx);
  const player = playerCombatant(stats, nextSave);
  const enemy = enemyCombatant(enemyType, lvl);

  let accuracy = player.accuracy;
  let damageMult = 1;
  let armorPen = 0;
  let critBonus = 0;

  let skillXpGained: number | undefined;
  let xpMult: number | undefined;
  let skillsUnlocked: string[] | undefined;

  if (ctx.skillId) {
    const skillLvl = nextSave.skillLevels[ctx.skillId] ?? 0;
    if (skillLvl <= 0) {
      ctx = { ...ctx, skillId: undefined };
    } else if (!ctx.skillFollowUp && isSkillOnCooldown(nextSave, ctx.skillId)) {
      return {
        hit: false,
        missed: true,
        crit: false,
        damage: 0,
        enemyHp,
        killed: false,
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        skillOnCooldown: true,
      };
    }
  }

  const skillDef = ctx.skillId ? getSkill(ctx.skillId) : undefined;
  const tactic: CombatTactic | undefined = skillDef?.tactic;
  const hasGeom =
    ctx.playerX !== undefined &&
    ctx.playerY !== undefined &&
    ctx.enemyX !== undefined &&
    ctx.enemyY !== undefined &&
    Boolean(ctx.enemyFacing);
  const arc: AttackArc | undefined = hasGeom
    ? attackArc(ctx.playerX!, ctx.playerY!, ctx.enemyX!, ctx.enemyY!, ctx.enemyFacing!)
    : undefined;
  const hpRatio = enemyHp / Math.max(1, ctx.enemyMaxHp ?? enemyHp);

  if (ctx.skillId && !ctx.skillFollowUp) {
    const gate = evaluateTacticGate({ tactic, arc, hpRatio, dashing: ctx.dashing });
    if (!gate.ok) {
      return {
        hit: false,
        missed: true,
        crit: false,
        damage: 0,
        enemyHp,
        killed: false,
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        skillRequireFailed: gate.fail,
        arc,
      };
    }
    nextSave = refreshPlayerStamina(nextSave);
    if (playerStaminaOf(nextSave) < PLAYER_SKILL_MIN_STAMINA) {
      return {
        hit: false,
        missed: true,
        crit: false,
        damage: 0,
        enemyHp,
        killed: false,
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        insufficientStamina: true,
      };
    }
  }

  if (ctx.skillId) {
    const mods = getActiveSkillModifiers(nextSave, ctx.skillId);
    const mpCost = ctx.skillFollowUp ? 0 : Math.max(0, Math.floor(mods.mpCost ?? 0));
    if (mpCost > 0 && (nextSave.mp ?? 0) < mpCost) {
      return {
        hit: false,
        missed: true,
        crit: false,
        damage: 0,
        enemyHp,
        killed: false,
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        insufficientMp: true,
      };
    }
    damageMult = mods.damageMultiplier ?? 1;
    armorPen = mods.armorPenetration ?? 0;
    critBonus = mods.critBonus ?? 0;
    accuracy += mods.accuracyBonus ?? 0;
    if (mpCost > 0) {
      nextSave = {
        ...nextSave,
        mp: Math.max(0, (nextSave.mp ?? 0) - mpCost),
      };
    }
    if (!ctx.skillFollowUp) {
      nextSave = setSkillCooldown(nextSave, ctx.skillId);
    }
  } else if (!ctx.chargeAttack) {
    const basicMp = mysticBasicAttackMpCost(nextSave);
    if (basicMp > 0) {
      if ((nextSave.mp ?? 0) < basicMp) {
        return {
          hit: false,
          missed: true,
          crit: false,
          damage: 0,
          enemyHp,
          killed: false,
          save: nextSave,
          stats: computeStats(nextSave, ctx),
          insufficientMp: true,
        };
      }
      nextSave = {
        ...nextSave,
        mp: Math.max(0, (nextSave.mp ?? 0) - basicMp),
      };
    } else {
      // медленный реген MP вне кастов (не мистик)
      const maxMp = computeStats(nextSave, ctx).maxMp;
      if (maxMp > 0) {
        nextSave = {
          ...nextSave,
          mp: Math.min(maxMp, (nextSave.mp ?? 0) + 2),
        };
      }
    }
  }

  if (isBowEquipped(nextSave) && !ctx.skipAmmoConsume) {
    const spent = consumeQuiverAmmo(nextSave);
    if (!spent.ok) {
      return {
        hit: false,
        missed: true,
        crit: false,
        damage: 0,
        enemyHp,
        killed: false,
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        noAmmo: true,
      };
    }
    nextSave = spent.save;
  }

  if (adv >= 1) damageMult *= 1.08;
  if (adv >= 2) damageMult *= 1.1;
  if (ctx.chargeMult && ctx.chargeMult > 0) damageMult *= ctx.chargeMult;

  const pendingRiposte = getShieldRiposte(nextSave);
  const pendingRank = pendingRiposte.active
    ? (nextSave.skillLevels.shield_riposte ?? 0)
    : 0;
  if (pendingRiposte.active && pendingRank > 0) {
    accuracy += shieldRiposteModifiers(pendingRank).accuracy;
  }

  const magic = isMagicAttack(nextSave);
  const dist =
    ctx.playerX !== undefined &&
    ctx.playerY !== undefined &&
    ctx.enemyX !== undefined &&
    ctx.enemyY !== undefined
      ? Math.hypot(ctx.playerX - ctx.enemyX, ctx.playerY - ctx.enemyY)
      : undefined;
  const positional = !magic && !isBowEquipped(nextSave) && arc !== undefined;
  const bonuses = tacticStrikeBonuses({
    tactic,
    arc: arc ?? 'front',
    positional,
    distance: dist,
    marked: Boolean(ctx.marked),
    rangeBias: skillDef?.rangeBias,
  });
  damageMult *= bonuses.damageMult;
  accuracy += bonuses.accuracy;
  critBonus += bonuses.critBonus;
  if (isBowEquipped(nextSave) && dist !== undefined) {
    const falloff = rangedDistanceMods(dist);
    damageMult *= falloff.damageMult;
    accuracy += falloff.accuracy;
  }
  if (ctx.cleaveSplash) damageMult *= CLEAVE_SPLASH_MULT;
  const comboCount = Math.max(1, ctx.comboCount ?? 1);
  damageMult *= comboDamageMultiplier(comboCount);
  if (!ctx.skipStaminaConsume && !ctx.skillFollowUp) {
    nextSave = spendCombatStamina(nextSave, Boolean(ctx.skillId));
  }
  const stamNow = playerStaminaOf(nextSave);
  accuracy -= attackFatigueAccuracyPenalty(stamNow);
  damageMult *= attackFatigueDamageMult(stamNow);

  const magicLevel = effectiveMagicLevel(nextSave, ctx.skillId);
  const hit = ctx.chargeAttack || bonuses.seek
    ? true
    : magic
      ? rollMagicHit(magicLevel, enemy.level, accuracy)
      : rollHit(accuracy, enemy.evasion, false);
  if (!hit) {
    return {
      hit: false,
      missed: true,
      crit: false,
      damage: 0,
      enemyHp,
      killed: false,
      save: nextSave,
      stats: computeStats(nextSave, ctx),
      swarmFrenzyProc: proc.procced,
      swarmFrenzyActive: frenzy.active || proc.procced,
      swarmFrenzyEnemies: getSwarmFrenzy(nextSave).enemyCount || undefined,
      swarmFrenzyRemainingMs: getSwarmFrenzy(nextSave).remainingMs || undefined,
      madDualistProc: dualProc.procced,
      madDualistActive: dual.active || dualProc.procced,
      madDualistRemainingMs: getMadDualist(nextSave).remainingMs || undefined,
      shieldRiposteActive: pendingRiposte.active,
      shieldRiposteRemainingMs: pendingRiposte.remainingMs || undefined,
      backstab: bonuses.backstab || undefined,
      execute: bonuses.execute || undefined,
      snipe: bonuses.snipe || undefined,
      vanish: bonuses.vanish || undefined,
      seek: bonuses.seek || undefined,
      arc,
      combo: comboCount,
    };
  }

  let riposteConsumed = false;
  if (pendingRiposte.active) {
    const riposte = consumeShieldRiposte(nextSave);
    nextSave = riposte.save;
    riposteConsumed = riposte.consumed;
    if (riposte.consumed) {
      damageMult *= shieldRiposteModifiers(riposte.rank).damageMult;
    }
  }

  const crit = bonuses.guaranteedCrit || rollCrit(player.critRate, critBonus);
  const dmgOpts = {
    damageMultiplier: damageMult,
    armorPenetration: armorPen,
    crit,
  };
  let damage = magic
    ? calcMagicDamage(player, enemy, dmgOpts)
    : calcPhysicalDamage(player, enemy, dmgOpts);

  if (magic) {
    const resist = rollMagicResistOutcome(magicLevel, enemy.level);
    if (resist === 'full') {
      return {
        hit: false,
        missed: true,
        crit: false,
        damage: 0,
        enemyHp,
        killed: false,
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        swarmFrenzyProc: proc.procced,
        swarmFrenzyActive: frenzy.active || proc.procced,
        swarmFrenzyEnemies: getSwarmFrenzy(nextSave).enemyCount || undefined,
        swarmFrenzyRemainingMs: getSwarmFrenzy(nextSave).remainingMs || undefined,
        madDualistProc: dualProc.procced,
        madDualistActive: dual.active || dualProc.procced,
        madDualistRemainingMs: getMadDualist(nextSave).remainingMs || undefined,
        shieldRiposteActive: pendingRiposte.active,
        shieldRiposteRemainingMs: pendingRiposte.remainingMs || undefined,
        backstab: bonuses.backstab || undefined,
        execute: bonuses.execute || undefined,
        snipe: bonuses.snipe || undefined,
        vanish: bonuses.vanish || undefined,
        seek: bonuses.seek || undefined,
        arc,
        combo: comboCount,
      };
    }
    damage = Math.floor(damage * magicLevelDamageMultiplier(magicLevel, enemy.level));
    if (resist === 'half') damage = Math.max(1, Math.floor(damage / 2));
  }

  let offhandHit: boolean | undefined;
  let offhandCrit: boolean | undefined;
  let offhandDamage: number | undefined;

  // Второй удар только на обычной атаке при активном баффе дуалиста
  if (!ctx.skillId && dual.active && !magic) {
    const offAcc = player.accuracy;
    const ohHit = rollHit(offAcc, enemy.evasion, false);
    offhandHit = ohHit;
    if (ohHit) {
      const ohCrit = rollCrit(player.critRate, 0);
      const offPlayer = { ...player, pAtk: computeOffhandStrikePAtk(nextSave) };
      offhandCrit = ohCrit;
      offhandDamage = calcPhysicalDamage(offPlayer, enemy, {
        damageMultiplier: 1,
        armorPenetration: 0,
        crit: ohCrit,
      });
      damage += offhandDamage;
    } else {
      offhandDamage = 0;
      offhandCrit = false;
    }
  }

  const newHp = Math.max(0, enemyHp - damage);
  const killed = newHp <= 0;

  let questCompleted: boolean | undefined;
  let lootAdded: string | undefined;
  let drops: DropRollResult[] | undefined;
  let xpGained: number | undefined;
  let leveledUp: boolean | undefined;
  let radioIncoming: { npcId: string } | undefined;

  const frenzyNow = getSwarmFrenzy(nextSave);
  let bleed:
    | { tickDamage: number; durationMs: number; tickMs: number; kind?: 'bleed' | 'poison' }
    | undefined =
    frenzyNow.active && !killed
      ? {
          tickDamage: calcBleedTickDamage(player.pAtk, frenzyNow.enemyCount),
          durationMs: 3000,
          tickMs: 500,
          kind: 'bleed',
        }
      : undefined;
  if (tactic === 'poison' && hit && !killed) {
    const rank = nextSave.skillLevels[ctx.skillId ?? 'poison_blade'] ?? 1;
    bleed = poisonDot(player.pAtk, rank, crit);
  }
  const markApplied = tactic === 'mark' && hit && !killed;
  const controlApplied =
    hit && !killed
      ? resolveSkillControl({
          control: skillDef?.control,
          hasShield: hasShieldEquipped(nextSave),
        })
      : undefined;

  if (ctx.skillId && hit && !killed) {
    let skillXp = XP_SKILL_ACTIVE_HIT;
    if (crit) skillXp += XP_SKILL_ACTIVE_CRIT_BONUS;
    const skillResult = grantXp(nextSave, skillXp);
    nextSave = skillResult.save;
    skillXpGained = skillResult.xpGained;
    xpGained = skillResult.xpGained;
    leveledUp = skillResult.leveledUp;
    if (skillResult.skillsUnlocked.length) skillsUnlocked = skillResult.skillsUnlocked;
  }

  if (killed) {
    const reward = rewardEnemyKill(nextSave, enemyType, lvl, quests, questId, ctx);
    nextSave = reward.save;
    questCompleted = reward.questCompleted;
    lootAdded = reward.lootAdded;
    drops = reward.drops;
    xpGained = (xpGained ?? 0) + (reward.xpGained ?? 0);
    leveledUp = leveledUp || reward.leveledUp;
    radioIncoming = reward.radioIncoming;
    skillsUnlocked = [...(skillsUnlocked ?? []), ...(reward.skillsUnlocked ?? [])];
    xpMult = reward.xpMultiplier;
  }

  return {
    hit: true,
    missed: false,
    crit,
    damage,
    enemyHp: newHp,
    killed,
    save: nextSave,
    stats: computeStats(nextSave, ctx),
    questCompleted,
    lootAdded,
    drops,
    xpGained,
    skillXpGained,
    leveledUp,
    enemyLevel: lvl,
    levelAdvantage: adv,
    mobDifficulty: difficultyLabel(diff),
    xpMultiplier: xpMult,
    skillsUnlocked,
    swarmFrenzyProc: proc.procced,
    swarmFrenzyActive: frenzyNow.active,
    swarmFrenzyEnemies: frenzyNow.active ? frenzyNow.enemyCount : undefined,
    swarmFrenzyRemainingMs: frenzyNow.active ? frenzyNow.remainingMs : undefined,
    madDualistProc: dualProc.procced,
    madDualistActive: getMadDualist(nextSave).active || dualProc.procced,
    madDualistRemainingMs: getMadDualist(nextSave).remainingMs || undefined,
    offhandHit,
    offhandCrit,
    offhandDamage,
    bleed,
    shieldRiposteConsumed: riposteConsumed,
    shieldRiposteActive: getShieldRiposte(nextSave).active,
    shieldRiposteRemainingMs: getShieldRiposte(nextSave).remainingMs || undefined,
    radioIncoming,
    backstab: bonuses.backstab || undefined,
    execute: bonuses.execute || undefined,
    snipe: bonuses.snipe || undefined,
    marked: bonuses.marked || undefined,
    markApplied: markApplied || undefined,
    vanish: bonuses.vanish || undefined,
    seek: bonuses.seek || undefined,
    pyre: bonuses.pyre || undefined,
    controlApplied,
    arc,
    cleaveSplash: ctx.cleaveSplash || undefined,
    combo: comboCount,
  };
}

export function resolveEnemyHit(
  save: PlayerSave,
  enemyType: string,
  ctx: CombatContext & { counterAttack?: boolean; enemyLevel?: number },
): {
  hit: boolean;
  missed: boolean;
  dodged: boolean;
  blocked?: boolean;
  fullyBlocked?: boolean;
  perfectDodge?: boolean;
  damage: number;
  dodgeChance: number;
  save: PlayerSave;
  stats: PlayerStats;
  xpGained?: number;
  skillXpGained?: number;
  leveledUp?: boolean;
  swarmFrenzyProc?: boolean;
  swarmFrenzyActive?: boolean;
  swarmFrenzyEnemies?: number;
  swarmFrenzyRemainingMs?: number;
  madDualistActive?: boolean;
  madDualistRemainingMs?: number;
  shieldRiposteProc?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
} {
  const nearby = ctx.nearbyEnemyCount ?? 0;
  const proc = tryProcSwarmFrenzy(save, nearby);
  let nextSave = proc.save;
  const dual = getMadDualist(nextSave);

  const lvl = resolveEnemyLevel(enemyType, ctx.enemyLevel);
  const stats = computeStats(nextSave, ctx);
  const enemy = enemyCombatant(enemyType, lvl);
  // Дуалист = танец клинков: тот же бонус, что окно контратаки
  const eva = playerDefensiveEvasion(stats, {
    ...ctx,
    counterAttack: Boolean(ctx.counterAttack) || dual.active,
  });
  const hitChance = calcHitChance(enemy.accuracy, eva, true);
  const dodgeChance = 1 - hitChance;
  const dashIframes = Boolean(ctx.dashing);
  const hit = dashIframes ? false : Math.random() < hitChance;

  if (!hit) {
    const perfect = dashIframes || Boolean(ctx.counterAttack) || dodgeChance >= 0.99;
    const xpResult = grantXp(nextSave, perfect ? XP_SKILL_PERFECT_DODGE : XP_SKILL_DODGE);
    let afterDodge = xpResult.save;
    if (dashIframes) {
      afterDodge = grantPerfectDodgeStamina(afterDodge);
    }
    const frenzyNow = getSwarmFrenzy(afterDodge);
    return {
      hit: false,
      missed: true,
      dodged: true,
      perfectDodge: dashIframes || undefined,
      damage: 0,
      dodgeChance: dashIframes ? 1 : dodgeChance,
      save: afterDodge,
      stats: computeStats(afterDodge, ctx),
      xpGained: xpResult.xpGained,
      skillXpGained: xpResult.xpGained,
      leveledUp: xpResult.leveledUp,
      swarmFrenzyProc: proc.procced,
      swarmFrenzyActive: frenzyNow.active || proc.procced,
      swarmFrenzyEnemies: frenzyNow.enemyCount || undefined,
      swarmFrenzyRemainingMs: frenzyNow.remainingMs || undefined,
      madDualistActive: dual.active,
      madDualistRemainingMs: dual.remainingMs || undefined,
    };
  }

  const damageRaw = calcPhysicalDamage(enemy, playerCombatant(stats, nextSave));
  const blockRoll = (stats.blockChance ?? 0) / 100;
  const blocked = blockRoll > 0 && Math.random() < blockRoll;
  const hpRatio = nextSave.hp / Math.max(1, stats.maxHp);
  const fullBlock =
    blocked && Math.random() < unyieldingFullBlockChance(nextSave, hpRatio);
  let damage = damageRaw;
  if (fullBlock) {
    damage = 0;
  } else if (blocked) {
    damage = Math.max(1, Math.floor(damageRaw * blockDamageTaken(nextSave)));
  }
  nextSave = { ...nextSave, hp: Math.max(0, nextSave.hp - damage) };
  if (nextSave.hp <= 0) {
    nextSave = dismount(nextSave);
  }
  let riposteProc = false;
  if (blocked) {
    const armed = activateShieldRiposte(nextSave);
    riposteProc = armed !== nextSave;
    nextSave = armed;
  }
  const frenzyNow = getSwarmFrenzy(nextSave);
  const riposteNow = getShieldRiposte(nextSave);

  return {
    hit: true,
    missed: false,
    dodged: false,
    blocked,
    fullyBlocked: fullBlock || undefined,
    damage,
    dodgeChance,
    save: nextSave,
    stats: computeStats(nextSave, ctx),
    swarmFrenzyProc: proc.procced,
    swarmFrenzyActive: frenzyNow.active || proc.procced,
    swarmFrenzyEnemies: frenzyNow.active || proc.procced ? frenzyNow.enemyCount : undefined,
    swarmFrenzyRemainingMs: frenzyNow.remainingMs || undefined,
    madDualistActive: dual.active,
    madDualistRemainingMs: dual.remainingMs || undefined,
    shieldRiposteProc: riposteProc || undefined,
    shieldRiposteActive: riposteNow.active || undefined,
    shieldRiposteRemainingMs: riposteNow.remainingMs || undefined,
  };
}
