import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';
import type { PlayerSave, SkillDefinition } from '@empery/shared';
import { contentRoot } from './paths.js';
import {
  MAD_DUALIST_ID,
  MAD_DUALIST_LEVEL_STEP,
  MAD_DUALIST_UNLOCK_LEVEL,
  madDualistDesiredLevel,
} from './mad-dualist.js';

/**
 * После открытия навыка: каждые N уровней персонажа → +1 ранг (до maxLevel).
 * Пример maxLevel 3, unlock 10: ур.10→1, ур.13→2, ур.16→3.
 */
export const SKILL_RANK_STEP = 3;

/** @deprecated была фиксированная сетка 7/10/13/16/19 — заменена на SKILL_RANK_STEP */
export const SKILL_UPGRADE_LEVELS = [7, 10, 13, 16, 19];

/** Скиллы с собственной шкалой от уровня персонажа */
const LEVEL_SCALED_SKILLS = new Set([MAD_DUALIST_ID]);

/** Базовый уровень открытия для шкалы рангов (стартовые без unlockLevel → 1). */
export function skillBaseUnlockLevel(skill: SkillDefinition): number {
  return skill.unlockLevel && skill.unlockLevel > 0 ? skill.unlockLevel : 1;
}

/**
 * Желаемый ранг навыка от уровня персонажа.
 * Стартовые (без unlockLevel) качаются только если уже изучены.
 */
export function desiredSkillRank(
  playerLevel: number,
  skill: SkillDefinition,
  opts?: { alreadyLearned?: boolean },
): number {
  if (LEVEL_SCALED_SKILLS.has(skill.id)) {
    return madDualistDesiredLevel(playerLevel, skill.maxLevel);
  }

  const unlock = skill.unlockLevel ?? 0;
  if (unlock > 0) {
    if (playerLevel < unlock) return 0;
    return Math.min(
      skill.maxLevel,
      1 + Math.floor((playerLevel - unlock) / SKILL_RANK_STEP),
    );
  }

  if (!opts?.alreadyLearned) return 0;
  return Math.min(
    skill.maxLevel,
    1 + Math.floor((playerLevel - 1) / SKILL_RANK_STEP),
  );
}

/** Уровень персонажа, на котором навык получит следующий ранг (или null). */
export function nextSkillRankAtLevel(
  skill: SkillDefinition,
  currentRank: number,
): number | null {
  if (currentRank <= 0 || currentRank >= skill.maxLevel) return null;
  if (LEVEL_SCALED_SKILLS.has(skill.id)) {
    return MAD_DUALIST_UNLOCK_LEVEL + currentRank * MAD_DUALIST_LEVEL_STEP;
  }
  return skillBaseUnlockLevel(skill) + currentRank * SKILL_RANK_STEP;
}

let skillsList: SkillDefinition[] | null = null;
let skillsById: Map<string, SkillDefinition> | null = null;

function ensureSkillsCache(): void {
  if (skillsList && skillsById) return;
  const dir = join(contentRoot, 'skills');
  const list = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .flatMap((name) =>
      parseAllDocuments(readFileSync(join(dir, name), 'utf8')).map(
        (doc) => doc.toJSON() as SkillDefinition,
      ),
    )
    .filter((s) => Boolean(s?.id));
  const byId = new Map<string, SkillDefinition>();
  for (const skill of list) byId.set(skill.id, skill);
  skillsList = list;
  skillsById = byId;
}

export function loadSkills(): SkillDefinition[] {
  ensureSkillsCache();
  return skillsList!;
}

export function getSkill(id: string): SkillDefinition | undefined {
  ensureSkillsCache();
  return skillsById!.get(id);
}

/** Tests / hot-reload — drop cached YAML. `tsx watch` already restarts the process. */
export function clearSkillsCache(): void {
  skillsList = null;
  skillsById = null;
}

/** Бой / выживание / крафт — вкладки панели навыков. */
export function skillDomain(skill: SkillDefinition): 'combat' | 'survival' | 'craft' {
  return skill.domain === 'survival' || skill.domain === 'craft' ? skill.domain : 'combat';
}

export function skillsForProfession(professionId: string): SkillDefinition[] {
  return loadSkills().filter((s) => s.profession === professionId);
}

/** Навыки профессии с учётом расы + общие (выживание/крафт). */
export function skillAvailableForSave(
  skill: SkillDefinition,
  save: { profession: string; race: string },
): boolean {
  if (skill.profession !== 'common' && skill.profession !== save.profession) return false;
  if (skill.race && skill.race !== save.race) return false;
  return true;
}

export function skillsForSave(save: { profession: string; race: string }): SkillDefinition[] {
  return loadSkills().filter((s) => skillAvailableForSave(s, save));
}

/** Устаревшие id (перенесены с мистика на саппорта). */
export const OBSOLETE_SKILL_IDS = new Set(['healing_light', 'mystic_ward']);

/**
 * Убирает удалённые навыки и навыки другой расы/профессии из skillLevels / cooldowns.
 */
export function stripIneligibleSkills(save: PlayerSave): PlayerSave {
  const skillLevels = { ...save.skillLevels };
  const skillCooldowns = { ...save.skillCooldowns };
  let changed = false;

  for (const id of Object.keys(skillLevels)) {
    if (OBSOLETE_SKILL_IDS.has(id)) {
      delete skillLevels[id];
      delete skillCooldowns[id];
      changed = true;
      continue;
    }
    const skill = getSkill(id);
    if (!skill || !skillAvailableForSave(skill, save)) {
      delete skillLevels[id];
      delete skillCooldowns[id];
      changed = true;
    }
  }
  for (const id of Object.keys(skillCooldowns)) {
    if (!(id in skillLevels)) {
      delete skillCooldowns[id];
      changed = true;
    }
  }
  if (!changed) return save;
  return { ...save, skillLevels, skillCooldowns };
}

export interface SkillBonuses {
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  accuracy: number;
  evasion: number;
  evasionWhileMoving: number;
  evasionWhileIdle: number;
  critRate: number;
  maxHp: number;
  maxMp: number;
  blockChance: number;
  /** Бонус к дальности атаки (пиксели), суммируется с луком/скиллом. */
  attackRange: number;
  /** MP, восстанавливаемые за тик (клиент / сервер, обычно 5 с). */
  mpRegen: number;
  /** HP, восстанавливаемые за тик (обычно 5 с). */
  hpRegen: number;
  /** % к хилу союзных навыков. */
  healPowerPct: number;
  /** % к восстановлению MP союзных навыков. */
  mpRestorePct: number;
  /** % к силе исходящих бафов. */
  buffPowerPct: number;
}

export function computeSkillBonuses(save: PlayerSave): SkillBonuses {
  const out: SkillBonuses = {
    pAtk: 0,
    pDef: 0,
    mAtk: 0,
    mDef: 0,
    accuracy: 0,
    evasion: 0,
    evasionWhileMoving: 0,
    evasionWhileIdle: 0,
    critRate: 0,
    maxHp: 0,
    maxMp: 0,
    blockChance: 0,
    attackRange: 0,
    mpRegen: 0,
    hpRegen: 0,
    healPowerPct: 0,
    mpRestorePct: 0,
    buffPowerPct: 0,
  };

  const hasShield = Boolean(save.equipment.shield);

  for (const skill of skillsForSave(save)) {
    if (skill.type !== 'passive') continue;
    const lvl = save.skillLevels[skill.id] ?? 0;
    if (lvl <= 0 || !skill.effects) continue;
    if (skill.requiresShield && !hasShield) continue;

    for (const [stat, values] of Object.entries(skill.effects)) {
      const bonus = values[Math.min(lvl, values.length) - 1] ?? 0;
      if (stat in out) out[stat as keyof SkillBonuses] += bonus;
    }
  }

  return out;
}

export function getActiveSkillModifiers(
  save: PlayerSave,
  skillId: string,
): Record<string, number> {
  const skill = getSkill(skillId);
  const lvl = save.skillLevels[skillId] ?? 0;
  if (!skill || skill.type !== 'active' || lvl <= 0 || !skill.levels) return {};
  return skill.levels[Math.min(lvl, skill.maxLevel)] ?? {};
}

export function isSkillOnCooldown(save: PlayerSave, skillId: string): boolean {
  const until = save.skillCooldowns[skillId];
  if (!until) return false;
  return Date.now() < new Date(until).getTime();
}

export function setSkillCooldown(save: PlayerSave, skillId: string): PlayerSave {
  const skill = getSkill(skillId);
  if (!skill?.cooldownMs) return save;
  const until = new Date(Date.now() + skill.cooldownMs).toISOString();
  return {
    ...save,
    skillCooldowns: { ...save.skillCooldowns, [skillId]: until },
  };
}

/**
 * Открывает навыки и подтягивает ранги до desiredSkillRank (только вверх).
 * Старые сейвы с «застрявшими» 1/3 чинятся при normalize/load.
 */
export function unlockSkillsForLevel(save: PlayerSave): { save: PlayerSave; unlocked: string[] } {
  const unlocked: string[] = [];
  const levels = { ...save.skillLevels };

  for (const skill of skillsForSave(save)) {
    const current = levels[skill.id] ?? 0;
    const desired = desiredSkillRank(save.level, skill, { alreadyLearned: current > 0 });
    if (desired <= current) continue;
    if (current === 0) unlocked.push(skill.name);
    levels[skill.id] = desired;
  }

  return { save: { ...save, skillLevels: levels }, unlocked };
}

export function applySkillProgressionOnLevel(
  save: PlayerSave,
  newLevel: number,
): { save: PlayerSave; unlocked: string[] } {
  return unlockSkillsForLevel({ ...save, level: newLevel });
}

export function syncSkillProgression(save: PlayerSave): PlayerSave {
  return unlockSkillsForLevel(save).save;
}

import { SKILL_HOTBAR_SIZE } from '@empery/shared';

export { SKILL_HOTBAR_SIZE };

/**
 * Валидирует панель [1]–[9]: только изученные active.
 * Если поле ещё не задано — автозаполнение первыми двумя активными.
 */
export function normalizeSkillHotbar(save: PlayerSave): (string | null)[] {
  const learnedActives = skillsForSave(save)
    .filter(
      (s) =>
        skillDomain(s) === 'combat' &&
        s.type === 'active' &&
        (save.skillLevels[s.id] ?? 0) > 0,
    )
    .sort((a, b) => (a.unlockLevel ?? 1) - (b.unlockLevel ?? 1));

  const isValid = (id: string | null | undefined): id is string =>
    Boolean(id) && learnedActives.some((s) => s.id === id);

  if (save.skillHotbar === undefined) {
    const slots: (string | null)[] = Array.from({ length: SKILL_HOTBAR_SIZE }, () => null);
    slots[0] = learnedActives[0]?.id ?? null;
    slots[1] = learnedActives[1]?.id ?? null;
    return slots;
  }

  const raw = save.skillHotbar;
  const slots: (string | null)[] = [];
  const used = new Set<string>();
  for (let i = 0; i < SKILL_HOTBAR_SIZE; i++) {
    const id = raw[i] ?? null;
    if (isValid(id) && !used.has(id)) {
      slots.push(id);
      used.add(id);
    } else {
      slots.push(null);
    }
  }
  return slots;
}
