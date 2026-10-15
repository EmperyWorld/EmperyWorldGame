import type { PlayerSave, PlayerStats as SharedPlayerStats } from '@empery/shared';
import { calcAttackDelayMs, calcAttackSpeedRating, type WeaponWeight } from '@empery/shared/attack-speed';
import { enchantBonusForSlot, getEquipmentEnchant } from '@empery/shared';
import { getItem } from './items.js';
import { getRace } from './content.js';
import { computeSkillBonuses, type SkillBonuses } from './skills.js';
import { clearExpiredSwarmFrenzy, swarmFrenzyMultipliers } from './swarm-frenzy.js';
import {
  clearExpiredMadDualist,
  madDualistAttackSpeedMult,
} from './mad-dualist.js';
import {
  shieldBastionBlockBonus,
  unyieldingWallBlockBonus,
} from './shield-skills.js';
import { clearExpiredAllyBuffs, getAllyBuffBonuses } from './ally-buffs.js';
import {
  mountChargeRemainingMs,
  normalizeMountState,
  refreshMountStamina,
  saveCarryWeight,
  mountedSpeedForSave,
  mountCanRunOf,
  mountStaminaOf,
} from './mounts.js';
import {
  footSpeedForSave,
  playerCanRunOf,
  playerStaminaOf,
  refreshPlayerStamina,
} from './player-stamina.js';
import { survivalStatMultipliers } from './survival.js';

export interface CombatContext {
  /** Server geometry predicate; never accepted from a client. */
  lineOfSight?:(x:number,y:number)=>boolean;
  moving?: boolean;
  dashing?: boolean;
  /** Игрок в окне атаки (контратака) — усиленное уклонение */
  counterAttack?: boolean;
  /** Число врагов рядом (для пассивок вроде Рой клинков) */
  nearbyEnemyCount?: number;
  /** Множитель урона тарана верхом. */
  chargeMult?: number;
  /** Таран всегда попадает (без ролла меткости). */
  chargeAttack?: boolean;
}

export type PlayerStats = SharedPlayerStats & {
  evasionWhileMoving: number;
  evasionWhileIdle: number;
};

function weaponAttackBonus(itemStats: Record<string, number>): number {
  if (itemStats.attackSpeed !== undefined) return itemStats.attackSpeed;
  if (itemStats.speed !== undefined) return Math.floor(itemStats.speed * 0.45);
  return 0;
}

function equippedWeaponWeight(save: PlayerSave): { weight: WeaponWeight; bonusMs: number } {
  const weaponId = save.equipment.weapon;
  if (!weaponId) return { weight: 'normal', bonusMs: 0 };
  const weapon = getItem(weaponId);
  if (!weapon) return { weight: 'normal', bonusMs: 0 };
  const weight = (weapon.weaponWeight ?? 'normal') as WeaponWeight;
  return { weight, bonusMs: weaponAttackBonus(weapon.stats) };
}

function raceAttributes(race: string): { str: number; dex: number; con: number; mag: number } {
  const bonuses = getRace(race)?.bonuses ?? {};
  return {
    str: 10 + (bonuses.strength ?? 0),
    dex: 10 + (bonuses.agility ?? 0),
    con: 10 + (bonuses.vitality ?? 0),
    mag: 10 + (bonuses.magic ?? 0),
  };
}

function itemStat(itemStats: Record<string, number>, key: string, legacy?: string): number {
  if (itemStats[key] !== undefined) return itemStats[key];
  if (legacy && itemStats[legacy] !== undefined) return itemStats[legacy];
  return 0;
}

function applySkillBonuses(
  base: Omit<PlayerStats, 'evasionWhileMoving' | 'evasionWhileIdle'>,
  skills: SkillBonuses,
): PlayerStats {
  const pAtk = base.pAtk + skills.pAtk;
  const pDef = base.pDef + skills.pDef;
  const mAtk = base.mAtk + skills.mAtk;
  const mDef = base.mDef + skills.mDef;
  const maxHp = base.maxHp + skills.maxHp;
  const maxMp = base.maxMp + skills.maxMp;
  return {
    ...base,
    maxHp,
    maxMp,
    pAtk,
    pDef,
    mAtk,
    mDef,
    accuracy: base.accuracy + skills.accuracy,
    evasion: base.evasion + skills.evasion,
    critRate: base.critRate + skills.critRate,
    blockChance: (base.blockChance ?? 0) + skills.blockChance,
    evasionWhileMoving: skills.evasionWhileMoving,
    evasionWhileIdle: skills.evasionWhileIdle,
    damage: pAtk,
    defense: pDef,
  };
}

/** Слоты, чьи статы не суммируются в общий pAtk (второй клинок — отдельный удар). */
const STAT_SKIP_SLOTS = new Set(['weapon2']);

export function computeStats(save: PlayerSave, ctx: CombatContext = {}): PlayerStats {
  const attrs = raceAttributes(save.race);
  const skills = computeSkillBonuses(save);
  let working = clearExpiredSwarmFrenzy(save);
  working = clearExpiredMadDualist(working);
  working = clearExpiredAllyBuffs(working);
  const frenzy = swarmFrenzyMultipliers(working);
  const dualSpd = madDualistAttackSpeedMult(working);
  const allyBuff = getAllyBuffBonuses(working);

  let maxHp = 120 + (save.level - 1) * 10 + attrs.con * 10;
  let maxMp = 40 + (save.level - 1) * 4 + attrs.mag * 8;
  if (save.profession === 'mystic' || save.profession === 'support') maxMp += 30 + save.level * 2;
  let pAtk =
    save.profession === 'mystic' || save.profession === 'support'
      ? 3 + Math.floor(save.level / 2) + Math.floor(attrs.str / 4)
      : 6 + save.level + Math.floor(attrs.str / 2);
  let pDef = 0;
  let mAtk =
    save.profession === 'mystic' || save.profession === 'support'
      ? 6 + save.level + Math.floor(attrs.mag / 2)
      : 2 + Math.floor(attrs.mag / 3) + Math.floor(save.level / 3);
  let mDef = 5 + Math.floor(attrs.mag / 3) + Math.floor(attrs.con / 4) + Math.floor(save.level / 2);
  let accuracy = Math.floor(Math.sqrt(attrs.dex) * 6) + save.level;
  let evasion = Math.floor(Math.sqrt(attrs.dex) * 6) + save.level;
  if (save.profession === 'rogue') {
    // Уклонение — ниша разбойника; полный DEX-формула.
  } else {
    // Воин / лучник / кастер / саппорт: броня, блок или дистанция — не dodge-tank.
    evasion = Math.max(1, Math.floor(evasion * 0.22) - 5);
  }
  let speed = 180 + attrs.dex * 2;
  let blockChance = 0;

  for (const [slot, itemId] of Object.entries(working.equipment)) {
    if (!itemId || STAT_SKIP_SLOTS.has(slot)) continue;
    const item = getItem(itemId);
    if (!item) continue;
    const s = item.stats;
    maxHp += itemStat(s, 'maxHp');
    maxMp += itemStat(s, 'maxMp');
    const itemPAtk = itemStat(s, 'pAtk', 'damage');
    const itemMAtk = itemStat(s, 'mAtk');
    if (item.weaponKind === 'staff') {
      // посох качает M.Atk; legacy YAML мог писать pAtk
      mAtk += itemMAtk > 0 ? itemMAtk : itemPAtk;
    } else {
      pAtk += itemPAtk;
      mAtk += itemMAtk;
    }
    pDef += itemStat(s, 'pDef', 'defense');
    mDef += itemStat(s, 'mDef');
    accuracy += itemStat(s, 'accuracy');
    evasion += itemStat(s, 'evasion');
    speed += itemStat(s, 'speed');
    blockChance += itemStat(s, 'blockChance');
  }

  for (const [slot, itemId] of Object.entries(working.equipment)) {
    if (!itemId || STAT_SKIP_SLOTS.has(slot)) continue;
    const level = getEquipmentEnchant(working.equipmentEnchants, slot);
    const bonus = enchantBonusForSlot(slot, level);
    maxHp += bonus.maxHp ?? 0;
    const item = getItem(itemId);
    if (slot === 'weapon' || slot === 'weapon2') {
      if (item?.weaponKind === 'staff') mAtk += bonus.pAtk ?? 0;
      else pAtk += bonus.pAtk ?? 0;
    } else if (item?.armorType === 'robe') {
      mDef += bonus.pDef ?? 0;
      pDef += Math.floor((bonus.pDef ?? 0) * 0.25);
    } else {
      pDef += bonus.pDef ?? 0;
    }
  }

  const critRate = 5 + Math.floor(attrs.dex / 3);
  const weapon = equippedWeaponWeight(working);
  let attackDelayMs = calcAttackDelayMs({
    dex: attrs.dex,
    weaponWeight: weapon.weight,
    itemBonusMs: weapon.bonusMs,
  });
  const attackSpeed = calcAttackSpeedRating(attackDelayMs);

  const withSkills = applySkillBonuses(
    {
      maxHp,
      maxMp,
      pAtk,
      pDef,
      mAtk,
      mDef,
      accuracy,
      evasion,
      critRate,
      speed,
      attackDelayMs,
      attackSpeed,
      weaponWeight: weapon.weight,
      blockChance,
      str: attrs.str,
      dex: attrs.dex,
      con: attrs.con,
      damage: pAtk,
      defense: pDef,
    },
    skills,
  );

  const mainWeapon = working.equipment.weapon ? getItem(working.equipment.weapon) : undefined;
  const isBow = mainWeapon?.weaponKind === 'bow';
  const isStaff = mainWeapon?.weaponKind === 'staff';
  withSkills.rangedWeapon = isBow || isStaff;
  withSkills.rangedKind = isStaff ? 'magic' : isBow ? 'bow' : undefined;
  const weaponRange =
    mainWeapon?.attackRange && mainWeapon.attackRange > 0 ? mainWeapon.attackRange : 0;
  // Заточка лука/посоха: +4 дальности за уровень.
  let enchantRange = 0;
  if ((isBow || isStaff) && working.equipment.weapon) {
    const lvl = getEquipmentEnchant(working.equipmentEnchants, 'weapon');
    enchantRange = Math.max(0, lvl) * 4;
  }
  const rangeBonus = skills.attackRange + enchantRange;
  withSkills.attackRange =
    weaponRange > 0 ? weaponRange + rangeBonus : undefined;

  if (save.profession === 'rogue') {
    if (ctx.moving || ctx.dashing) {
      withSkills.evasion += withSkills.evasionWhileMoving + 6;
    }
    if (ctx.dashing) {
      withSkills.evasion += 15;
    }
  } else if (ctx.moving || ctx.dashing) {
    // Чужие пассивки уклонения (если есть) — без универсального «уворот в беге».
    withSkills.evasion += withSkills.evasionWhileMoving;
  }

  const idle = !ctx.moving && !ctx.dashing;
  const hpRatio = save.hp / Math.max(1, withSkills.maxHp);
  withSkills.blockChance =
    (withSkills.blockChance ?? 0) +
    unyieldingWallBlockBonus(working, hpRatio) +
    shieldBastionBlockBonus(working, idle);
  withSkills.blockChance = Math.min(75, Math.max(0, withSkills.blockChance));
  if (save.profession === 'mystic' || save.profession === 'support') {
    withSkills.blockChance = 0;
  }

  if (frenzy) {
    withSkills.pAtk = Math.max(1, Math.floor(withSkills.pAtk * frenzy.pAtkMult));
    withSkills.mAtk = Math.max(1, Math.floor(withSkills.mAtk * frenzy.pAtkMult));
    withSkills.damage = withSkills.pAtk;
    withSkills.evasion = Math.max(1, Math.floor(withSkills.evasion * frenzy.evasionMult));
    withSkills.attackDelayMs = Math.max(80, Math.floor(withSkills.attackDelayMs / frenzy.attackSpeedMult));
    withSkills.attackSpeed = calcAttackSpeedRating(withSkills.attackDelayMs);
  }

  if (dualSpd > 1) {
    withSkills.attackDelayMs = Math.max(80, Math.floor(withSkills.attackDelayMs / dualSpd));
    withSkills.attackSpeed = calcAttackSpeedRating(withSkills.attackDelayMs);
  }

  if (allyBuff.pAtk > 0) {
    withSkills.pAtk += allyBuff.pAtk;
    withSkills.damage = withSkills.pAtk;
  }
  if (allyBuff.pDef > 0) withSkills.pDef += allyBuff.pDef;
  if (allyBuff.mAtk > 0) withSkills.mAtk += allyBuff.mAtk;
  if (allyBuff.mDef > 0) withSkills.mDef += allyBuff.mDef;
  if (allyBuff.critRate > 0) withSkills.critRate += allyBuff.critRate;
  if (allyBuff.accuracy > 0) withSkills.accuracy += allyBuff.accuracy;
  if (allyBuff.mpRegen > 0) {
    withSkills.mpRegen = (withSkills.mpRegen ?? 0) + allyBuff.mpRegen;
  }
  if (allyBuff.speed > 0) {
    withSkills.speed += allyBuff.speed;
  }
  if (allyBuff.attackSpeed > 0) {
    const mult = 1 + allyBuff.attackSpeed / 100;
    withSkills.attackDelayMs = Math.max(80, Math.floor(withSkills.attackDelayMs / mult));
    withSkills.attackSpeed = calcAttackSpeedRating(withSkills.attackDelayMs);
  }

  withSkills.mpRegen = (withSkills.mpRegen ?? 0) + (skills.mpRegen ?? 0);
  withSkills.hpRegen = (withSkills.hpRegen ?? 0) + (skills.hpRegen ?? 0);
  const carry = saveCarryWeight(working);
  let fresh = refreshMountStamina(working, Date.now(), carry.totalKg);
  fresh = refreshPlayerStamina(fresh, Date.now(), carry.totalKg);
  const mount = normalizeMountState(fresh.mount);
  const mounted = Boolean(mount.mounted && mount.ownedId);
  withSkills.mounted = mounted;
  withSkills.mountChargeRemainingMs = mountChargeRemainingMs(fresh);
  withSkills.bodyWeightKg = carry.bodyKg;
  withSkills.gearWeightKg = carry.gearKg;
  withSkills.bagWeightKg = carry.bagKg;
  withSkills.carryWeightKg = carry.totalKg;
  withSkills.mountStamina = mountStaminaOf(fresh);
  withSkills.mountCanRun = mountCanRunOf(fresh);
  withSkills.stamina = playerStaminaOf(fresh);
  withSkills.staminaCanRun = playerCanRunOf(fresh);
  const baseFoot = withSkills.speed;
  withSkills.footSpeed = baseFoot;
  if (mounted) {
    withSkills.speed = Math.max(1, Math.floor(mountedSpeedForSave(fresh, baseFoot, carry.totalKg)));
  } else {
    withSkills.speed = Math.max(1, Math.floor(footSpeedForSave(fresh, baseFoot, carry.totalKg)));
  }
  const survival = survivalStatMultipliers(fresh);
  withSkills.movementSpeedMult = survival.speed;
  withSkills.speed = Math.max(1, Math.floor(withSkills.speed * survival.speed));
  withSkills.accuracy = Math.max(1, Math.floor(withSkills.accuracy * survival.accuracy));
  withSkills.staminaCanRun = Boolean(withSkills.staminaCanRun && survival.stamina >= 0.7);
  withSkills.hpRegen = Math.floor((withSkills.hpRegen ?? 0) * survival.hpRegen);
  withSkills.survivalConditions = survival.conditions;
  withSkills.survivalSeverity = survival.severity;
  const bodyItem = working.equipment.body ? getItem(working.equipment.body) : undefined;
  const bodyArmor = bodyItem?.armorType;
  withSkills.bodyArmorType =
    bodyArmor === 'heavy' || bodyArmor === 'light' || bodyArmor === 'robe'
      ? bodyArmor
      : working.profession === 'mystic' || working.profession === 'support'
        ? 'robe'
        : 'light';
  return withSkills;
}

/**
 * P.Atk для удара вторым клинком: база персонажа + только weapon2 (без основного оружия).
 */
export function computeOffhandStrikePAtk(save: PlayerSave): number {
  const attrs = raceAttributes(save.race);
  const skills = computeSkillBonuses(save);
  let pAtk = 6 + save.level + Math.floor(attrs.str / 2) + skills.pAtk;

  const offId = save.equipment.weapon2;
  if (offId) {
    const item = getItem(offId);
    if (item) {
      pAtk += itemStat(item.stats, 'pAtk', 'damage');
      const level = getEquipmentEnchant(save.equipmentEnchants, 'weapon2');
      pAtk += enchantBonusForSlot('weapon2', level).pAtk ?? 0;
    }
  }
  return Math.max(1, pAtk);
}

export function applyStatsToSave(save: PlayerSave): PlayerSave {
  const stats = computeStats(save);
  const prevMaxMp = save.maxMp ?? 0;
  const hadMp = save.mp !== undefined;
  let mp = save.mp ?? stats.maxMp;
  if (!hadMp || prevMaxMp <= 0) {
    mp = stats.maxMp;
  } else if (stats.maxMp > prevMaxMp) {
    mp = Math.min(stats.maxMp, mp + (stats.maxMp - prevMaxMp));
  }
  return {
    ...save,
    maxHp: stats.maxHp,
    maxMp: stats.maxMp,
    hp: Math.min(save.hp, stats.maxHp),
    mp: Math.min(Math.max(0, mp), stats.maxMp),
  };
}
