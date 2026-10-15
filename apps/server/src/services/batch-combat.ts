import type { DropRollResult, GroundLootSpawnedResult, PlayerSave } from '@empery/shared';
import {
  attackReach,
  applyMobControl,
  buildCombatPlayerDelta,
  CLEAVE_MAX_TARGETS,
  isCleaveTactic,
  MARK_DURATION_MS,
  peekCombo,
  pushCombo,
  type CombatControlKind,
  type CombatPlayerDelta,
} from '@empery/shared';
import type { CombatContext, PlayerStats } from './stats.js';
import { computeStats } from './stats.js';
import type { QuestService } from './quests.js';
import { resolvePlayerAttack, rewardEnemyKill } from './combat.js';
import { encounterHasParticipant, getEncounter, markEntityDead, type EncounterEntity } from './encounter.js';
import { questIdForEnemyType } from './quest-ids.js';
import {
  attackRangeForSave,
  consumeQuiverAmmo,
  isBowEquipped,
  isRangedWeaponEquipped,
  requireRangedReady,
} from './ranged.js';
import { distance2d } from './pvp.js';
import { getSkill } from './skills.js';
import {
  armChargeCooldown,
  applyMountStaminaTick,
  getMount,
  isChargeReady,
  normalizeMountState,
  mountStaminaOf,
} from './mounts.js';
import { mountCanCharge } from '@empery/shared';
import { recordEntityDamage } from './loot-owner.js';
import type { DropRoll } from './drops.js';

export interface BatchHitResult {
  entityId: string;
  hit: boolean;
  missed: boolean;
  crit: boolean;
  damage: number;
  enemyHp: number;
  killed: boolean;
  offhandHit?: boolean;
  offhandCrit?: boolean;
  offhandDamage?: number;
  bleed?: { tickDamage: number; durationMs: number; tickMs: number; kind?: 'bleed' | 'poison' };
  riposte?: boolean;
  backstab?: boolean;
  execute?: boolean;
  snipe?: boolean;
  marked?: boolean;
  markApplied?: boolean;
  vanish?: boolean;
  seek?: boolean;
  pyre?: boolean;
  controlApplied?: CombatControlKind;
  arc?: 'front' | 'flank' | 'back';
  cleaveSplash?: boolean;
}

/** Pending ground-loot spawn after a kill (resolved in HTTP/WS layer). */
export interface KillLootPending {
  entityId: string;
  locationId: string;
  x: number;
  y: number;
  drops: DropRoll[];
  damageBySaveId: Record<string, number>;
  killerSaveId: string;
}

/** Внутренний результат резолва (с полным save для персистенса). */
export interface BatchAttackResult {
  save: PlayerSave;
  stats: PlayerStats;
  hits: BatchHitResult[];
  questCompleted?: boolean;
  lootAdded?: string;
  drops?: DropRollResult[];
  killLoot?: KillLootPending[];
  groundLoot?: GroundLootSpawnedResult[];
  xpGained?: number;
  skillXpGained?: number;
  leveledUp?: boolean;
  insufficientMp?: boolean;
  skillOnCooldown?: boolean;
  skillsUnlocked?: string[];
  swarmFrenzyProc?: boolean;
  swarmFrenzyActive?: boolean;
  swarmFrenzyEnemies?: number;
  swarmFrenzyRemainingMs?: number;
  madDualistProc?: boolean;
  madDualistActive?: boolean;
  madDualistRemainingMs?: number;
  shieldRiposteConsumed?: boolean;
  shieldRiposteActive?: boolean;
  shieldRiposteRemainingMs?: number;
  noBow?: boolean;
  noAmmo?: boolean;
  radioIncoming?: { npcId: string };
  insufficientStamina?: boolean;
  skillRequireFailed?: 'backstab' | 'execute' | 'vanish';
  combo?: number;
}

/** HTTP/клиент: стейт-дельта вместо полного сейва. */
export type CombatBatchWire = Omit<BatchAttackResult, 'save' | 'killLoot'> & {
  player: CombatPlayerDelta;
};

/** Упаковать ответ: клиент получает только player-дельту + события. */
export function toCombatBatchWire(before: PlayerSave, result: BatchAttackResult): CombatBatchWire {
  const { save: after, killLoot: _kl, ...rest } = result;
  return {
    ...rest,
    player: buildCombatPlayerDelta(before, after),
  };
}

function nearestEntityId(
  ids: string[],
  encounter: { entities: Map<string, EncounterEntity> },
  px: number,
  py: number,
): string | null {
  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const entity = encounter.entities.get(id);
    if (!entity || !entity.alive) continue;
    const d = distance2d(px, py, entity.x, entity.y);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

function applyHitDamage(entity: EncounterEntity, saveId: string, damage: number, offhandDamage?: number): void {
  const total = damage + (offhandDamage ?? 0);
  if (total <= 0) return;
  entity.damageBySaveId = recordEntityDamage(entity.damageBySaveId, saveId, total);
}

function dropsToRolls(drops: DropRollResult[] | undefined): DropRoll[] {
  if (!drops?.length) return [];
  return drops.map((d) =>
    d.kind === 'adena'
      ? { kind: 'adena' as const, count: d.count }
      : { kind: 'item' as const, itemId: d.itemId, count: d.count },
  );
}

function pushKillLoot(
  list: KillLootPending[],
  encounter: { locationId: string },
  entity: EncounterEntity,
  killerSaveId: string,
  drops: DropRollResult[] | undefined,
): void {
  const rolls = dropsToRolls(drops);
  if (!rolls.length) return;
  list.push({
    entityId: entity.entityId,
    locationId: encounter.locationId,
    x: entity.x,
    y: entity.y,
    drops: rolls,
    damageBySaveId: { ...entity.damageBySaveId },
    killerSaveId,
  });
  entity.damageBySaveId = undefined;
}

export function resolveBatchAttack(
  save: PlayerSave,
  encounterId: string,
  targetEntityIds: string[],
  ctx: CombatContext & {
    skillId?: string;
    partyShareCount?: number;
    playerX?: number;
    playerY?: number;
  },
  quests: QuestService,
  questIdFor: (enemyType: string, save: PlayerSave) => string | undefined = questIdForEnemyType,
): BatchAttackResult | { error: string } {
  const encounter = getEncounter(encounterId);
  if (!encounter || !encounterHasParticipant(encounter, save.id) || encounter.locationId !== save.location) {
    return { error: 'Encounter not found' };
  }
  if (!encounter.comboBySaveId) encounter.comboBySaveId = new Map();

  const hits: BatchHitResult[] = [];
  let nextSave = save;
  let aggregated: Omit<BatchAttackResult, 'hits' | 'save' | 'stats'> = {};
  const killLoot: KillLootPending[] = [];
  let skillApplied = false;

  if (isBowEquipped(nextSave)) {
    const ready = requireRangedReady(nextSave);
    if (!ready.ok) {
      return {
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        hits: [],
        noBow: ready.error === 'NO_BOW' || undefined,
        noAmmo: ready.error === 'NO_AMMO' || undefined,
      };
    }
  }

  const range = attackReach(attackRangeForSave(nextSave, ctx.skillId));
  const hasPos = Number.isFinite(ctx.playerX) && Number.isFinite(ctx.playerY);
  if (!hasPos) return { error: 'Authoritative position required' };
  const skillDef = ctx.skillId ? getSkill(ctx.skillId) : undefined;
  const cleave = isCleaveTactic(skillDef?.tactic);
  const singleSkill = Boolean(ctx.skillId) && !cleave;

  let uniqueIds = [...new Set(targetEntityIds)].slice(0, 8);
  if (hasPos) {
    uniqueIds = uniqueIds.filter((id) => {
      const entity = encounter.entities.get(id);
      if (!entity || !entity.alive) return false;
      return distance2d(ctx.playerX!, ctx.playerY!, entity.x, entity.y) <= range && (!ctx.lineOfSight || ctx.lineOfSight(entity.x,entity.y));
    });
  }

  // Дальнее без cleave — одна ближайшая. Cleave/nova бьют пачку даже с посохом/луком.
  if ((isRangedWeaponEquipped(nextSave) || singleSkill) && uniqueIds.length > 1 && !cleave) {
    if (hasPos) {
      const bestId = nearestEntityId(uniqueIds, encounter, ctx.playerX!, ctx.playerY!);
      uniqueIds = bestId ? [bestId] : [];
    } else {
      uniqueIds = uniqueIds.slice(0, 1);
    }
  }

  if (cleave && uniqueIds.length > 1 && hasPos) {
    const primary = nearestEntityId(uniqueIds, encounter, ctx.playerX!, ctx.playerY!);
    const rest = uniqueIds.filter((id) => id !== primary);
    uniqueIds = primary ? [primary, ...rest].slice(0, CLEAVE_MAX_TARGETS) : uniqueIds.slice(0, CLEAVE_MAX_TARGETS);
  } else if (cleave) {
    uniqueIds = uniqueIds.slice(0, CLEAVE_MAX_TARGETS);
  }

  if (uniqueIds.length === 0) {
    return {
      save: nextSave,
      stats: computeStats(nextSave, ctx),
      hits: [],
    };
  }

  const comboNow = Date.now();
  const prevCombo = encounter.comboBySaveId.get(save.id);
  const comboCount = peekCombo(prevCombo, comboNow) + 1;

  if (isBowEquipped(nextSave)) {
    const spent = consumeQuiverAmmo(nextSave);
    if (!spent.ok) {
      return {
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        hits: [],
        noAmmo: true,
      };
    }
    nextSave = spent.save;
  }

  let anyHit = false;
  for (const entityId of uniqueIds) {
    const entity = encounter.entities.get(entityId);
    if (!entity || !entity.alive) continue;

    const isFollowUp = skillApplied;
    const skillId = cleave || !skillApplied ? ctx.skillId : undefined;
    const marked =
      Boolean(entity.mark) &&
      entity.mark!.saveId === save.id &&
      entity.mark!.untilMs > Date.now();
    const result = resolvePlayerAttack(
      nextSave,
      entity.type,
      entity.hp,
      {
        ...ctx,
        skillId,
        enemyLevel: entity.level,
        skipAmmoConsume: true,
        enemyX: entity.x,
        enemyY: entity.y,
        enemyFacing: entity.facing,
        enemyMaxHp: entity.maxHp,
        skillFollowUp: Boolean(cleave && isFollowUp && skillId),
        skipStaminaConsume: isFollowUp,
        cleaveSplash: Boolean(cleave && isFollowUp),
        comboCount,
        marked,
      },
      quests,
      questIdFor(entity.type, nextSave),
    );

    if (result.skillOnCooldown) {
      return {
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        hits: [],
        skillOnCooldown: true,
      };
    }
    if (result.insufficientMp) {
      return {
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        hits: [],
        insufficientMp: true,
      };
    }
    if (result.insufficientStamina) {
      return {
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        hits: [],
        insufficientStamina: true,
      };
    }
    if (result.skillRequireFailed) {
      return {
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        hits: [],
        skillRequireFailed: result.skillRequireFailed,
      };
    }
    if (result.noBow || result.noAmmo) {
      return {
        save: nextSave,
        stats: computeStats(nextSave, ctx),
        hits: [],
        noBow: result.noBow,
        noAmmo: result.noAmmo,
      };
    }

    if (skillId) skillApplied = true;
    if (result.hit) anyHit = true;
    nextSave = result.save;
    entity.hp = result.enemyHp;
    if (result.bleed && !result.killed) {
      const now = Date.now();
      entity.dot = { sourceSaveId: save.id, tickDamage: result.bleed.tickDamage, tickMs: result.bleed.tickMs, nextTickAt: now + result.bleed.tickMs, expiresAt: now + result.bleed.durationMs };
    }
    applyHitDamage(entity, save.id, result.damage);
    if (result.markApplied && !result.killed) {
      entity.mark = { saveId: save.id, untilMs: Date.now() + MARK_DURATION_MS };
    }
    if (result.controlApplied && !result.killed) {
      applyMobControl(entity, result.controlApplied, Date.now());
    }
    if (result.killed) {
      entity.mark = undefined;
      entity.control = undefined;
      pushKillLoot(killLoot, encounter, entity, save.id, result.drops);
      markEntityDead(encounter, entity);
    }

    hits.push({
      entityId,
      hit: result.hit,
      missed: result.missed,
      crit: result.crit,
      damage: result.damage,
      enemyHp: result.enemyHp,
      killed: result.killed,
      offhandHit: result.offhandHit,
      offhandCrit: result.offhandCrit,
      offhandDamage: result.offhandDamage,
      bleed: result.bleed,
      riposte: result.shieldRiposteConsumed || undefined,
      backstab: result.backstab,
      execute: result.execute,
      snipe: result.snipe,
      marked: result.marked,
      markApplied: result.markApplied,
      vanish: result.vanish,
      seek: result.seek,
      pyre: result.pyre,
      controlApplied: result.controlApplied,
      arc: result.arc,
      cleaveSplash: Boolean(cleave && isFollowUp) || undefined,
    });

    if (result.questCompleted) aggregated.questCompleted = true;
    if (result.xpGained) aggregated.xpGained = (aggregated.xpGained ?? 0) + result.xpGained;
    if (result.skillXpGained) {
      aggregated.skillXpGained = (aggregated.skillXpGained ?? 0) + result.skillXpGained;
    }
    if (result.leveledUp) aggregated.leveledUp = true;
    if (result.skillsUnlocked?.length) {
      aggregated.skillsUnlocked = [...(aggregated.skillsUnlocked ?? []), ...result.skillsUnlocked];
    }
    if (result.drops?.length) {
      aggregated.drops = [...(aggregated.drops ?? []), ...result.drops];
    }
    if (result.lootAdded) {
      aggregated.lootAdded = aggregated.lootAdded
        ? `${aggregated.lootAdded}, ${result.lootAdded}`
        : result.lootAdded;
    }
    if (result.swarmFrenzyProc) aggregated.swarmFrenzyProc = true;
    if (result.swarmFrenzyActive) aggregated.swarmFrenzyActive = true;
    if (result.swarmFrenzyEnemies) aggregated.swarmFrenzyEnemies = result.swarmFrenzyEnemies;
    if (result.swarmFrenzyRemainingMs) {
      aggregated.swarmFrenzyRemainingMs = result.swarmFrenzyRemainingMs;
    }
    if (result.madDualistProc) aggregated.madDualistProc = true;
    if (result.madDualistActive) aggregated.madDualistActive = true;
    if (result.madDualistRemainingMs) {
      aggregated.madDualistRemainingMs = result.madDualistRemainingMs;
    }
    if (result.shieldRiposteConsumed) aggregated.shieldRiposteConsumed = true;
    if (result.shieldRiposteActive) aggregated.shieldRiposteActive = true;
    if (result.shieldRiposteRemainingMs) {
      aggregated.shieldRiposteRemainingMs = result.shieldRiposteRemainingMs;
    }
    if (result.radioIncoming) aggregated.radioIncoming = result.radioIncoming;
  }

  const comboState = pushCombo(prevCombo, comboNow, anyHit);
  encounter.comboBySaveId.set(save.id, comboState);

  return {
    save: nextSave,
    stats: computeStats(nextSave, ctx),
    hits,
    killLoot: killLoot.length ? killLoot : undefined,
    combo: anyHit ? comboState.count : 0,
    ...aggregated,
  };
}

/** Advance only a server-issued DOT; requests cannot force damage or death. */
export function resolveBleedKill(
  save: PlayerSave, encounterId: string, entityId: string,
  ctx: CombatContext & { partyShareCount?: number }, quests: QuestService,
  now = Date.now(),
): BatchAttackResult | { error: string } {
  const encounter = getEncounter(encounterId);
  if (!encounter || !encounterHasParticipant(encounter, save.id) || encounter.locationId !== save.location) return { error: 'Encounter not found' };
  const entity = encounter.entities.get(entityId);
  const empty = { save, stats: computeStats(save, ctx), hits: [] };
  const dot = entity?.dot;
  if (!entity?.alive || !dot || dot.sourceSaveId !== save.id) return empty;
  let damage = 0;
  while (dot.nextTickAt <= now && dot.nextTickAt <= dot.expiresAt && entity.hp > 0) {
    damage += dot.tickDamage;
    entity.hp = Math.max(0, entity.hp - dot.tickDamage);
    dot.nextTickAt += dot.tickMs;
  }
  if (dot.nextTickAt > dot.expiresAt) entity.dot = undefined;
  if (!damage) return empty;
  applyHitDamage(entity, save.id, damage);
  const killed = entity.hp <= 0;
  const reward = killed ? rewardEnemyKill(save, entity.type, entity.level, quests, questIdForEnemyType(entity.type, save), ctx) : { save };
  const killLoot: KillLootPending[] = [];
  if (killed) {
    pushKillLoot(killLoot, encounter, entity, save.id, 'drops' in reward ? reward.drops : undefined);
    markEntityDead(encounter, entity);
    entity.dot = undefined;
  }
  return { ...reward, save: reward.save, stats: computeStats(reward.save, ctx), hits: [{ entityId, hit: true, missed: false, crit: false, damage, enemyHp: entity.hp, killed }], killLoot: killLoot.length ? killLoot : undefined };
}

/** Таран верхом: один гарантированный удар по целям в радиусе корпуса. */
export function resolveMountCharge(
  save: PlayerSave,
  encounterId: string,
  targetEntityIds: string[],
  ctx: CombatContext & {
    partyShareCount?: number;
    playerX?: number;
    playerY?: number;
    chargeStaminaPaid?: boolean;
  },
  quests: QuestService,
): BatchAttackResult | { error: string } {
  const mount = normalizeMountState(save.mount);
  if (!mount.ownedId || !mount.mounted) {
    return { error: 'Not mounted' };
  }
  const def = getMount(mount.ownedId);
  if (!def) return { error: 'Mount not found' };
  if (!ctx.chargeStaminaPaid && !isChargeReady(save)) {
    return {
      save,
      stats: computeStats(save, ctx),
      hits: [],
    };
  }
  if (!ctx.chargeStaminaPaid && !mountCanCharge(mountStaminaOf(save))) {
    return {
      save,
      stats: computeStats(save, ctx),
      hits: [],
    };
  }

  const encounter = getEncounter(encounterId);
  if (!encounter || !encounterHasParticipant(encounter, save.id) || encounter.locationId !== save.location) {
    return { error: 'Encounter not found' };
  }

  const reach = def.chargeReach;
  const hasPos = Number.isFinite(ctx.playerX) && Number.isFinite(ctx.playerY);
  if (!hasPos) return { error: 'Authoritative position required' };
  let uniqueIds = [...new Set(targetEntityIds)].slice(0, 6);
  if (hasPos) {
    uniqueIds = uniqueIds.filter((id) => {
      const entity = encounter.entities.get(id);
      if (!entity || !entity.alive) return false;
      return distance2d(ctx.playerX!, ctx.playerY!, entity.x, entity.y) <= reach && (!ctx.lineOfSight || ctx.lineOfSight(entity.x,entity.y));
    });
  }

  let nextSave = ctx.chargeStaminaPaid ? save : armChargeCooldown(applyMountStaminaTick(save, { moving: true, running: true, chargePulse: true, dtSec: 0 }));
  const hits: BatchHitResult[] = [];
  let aggregated: Omit<BatchAttackResult, 'hits' | 'save' | 'stats'> = {};
  const killLoot: KillLootPending[] = [];

  for (const entityId of uniqueIds) {
    const entity = encounter.entities.get(entityId);
    if (!entity || !entity.alive) continue;

    const result = resolvePlayerAttack(
      nextSave,
      entity.type,
      entity.hp,
      {
        ...ctx,
        skillId: undefined,
        enemyLevel: entity.level,
        skipAmmoConsume: true,
        chargeAttack: true,
        chargeMult: def.chargeDamageMult,
        dashing: true,
      },
      quests,
      questIdForEnemyType(entity.type, nextSave),
    );
    nextSave = result.save;
    applyHitDamage(entity, save.id, result.damage);
    entity.hp = result.enemyHp;
    if (result.killed) {
      pushKillLoot(killLoot, encounter, entity, save.id, result.drops);
      markEntityDead(encounter, entity);
    }
    hits.push({
      entityId,
      hit: result.hit,
      missed: result.missed,
      crit: result.crit,
      damage: result.damage,
      enemyHp: result.enemyHp,
      killed: result.killed,
    });
    if (result.questCompleted) aggregated.questCompleted = true;
    if (result.lootAdded) aggregated.lootAdded = result.lootAdded;
    if (result.drops?.length) {
      aggregated.drops = [...(aggregated.drops ?? []), ...result.drops];
    }
    if (result.xpGained) aggregated.xpGained = (aggregated.xpGained ?? 0) + result.xpGained;
    if (result.leveledUp) aggregated.leveledUp = true;
    if (result.skillsUnlocked?.length) {
      aggregated.skillsUnlocked = [
        ...(aggregated.skillsUnlocked ?? []),
        ...result.skillsUnlocked,
      ];
    }
    if (result.radioIncoming) aggregated.radioIncoming = result.radioIncoming;
  }

  return {
    save: nextSave,
    stats: computeStats(nextSave, ctx),
    hits,
    killLoot: killLoot.length ? killLoot : undefined,
    ...aggregated,
  };
}

export function serializeEntity(entity: EncounterEntity): Omit<EncounterEntity, 'alive'> {
  const { alive: _a, ...rest } = entity;
  return rest;
}
