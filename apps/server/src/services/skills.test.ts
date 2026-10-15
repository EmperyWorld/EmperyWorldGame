import { describe, expect, it } from 'vitest';
import type { SkillDefinition } from '@empery/shared';
import {
  desiredSkillRank,
  nextSkillRankAtLevel,
  SKILL_RANK_STEP,
  unlockSkillsForLevel,
  skillsForProfession,
  skillsForSave,
  skillDomain,
} from './skills.js';
import { MAD_DUALIST_ID } from './mad-dualist.js';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';

function skill(partial: Partial<SkillDefinition> & Pick<SkillDefinition, 'id'>): SkillDefinition {
  return {
    name: partial.id,
    type: 'passive',
    profession: 'rogue',
    maxLevel: 3,
    description: '',
    ...partial,
  };
}

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 't',
    name: 'Test',
    race: 'human',
    profession: 'rogue',
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'starter_grove',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe('desiredSkillRank', () => {
  const late = skill({ id: 'shadow_veil', unlockLevel: 19, maxLevel: 3 });
  const early = skill({ id: 'backstab', unlockLevel: 1, maxLevel: 3 });
  const starter = skill({ id: 'acrobatic_move', maxLevel: 3 });

  it('unlocks at unlockLevel with rank 1', () => {
    expect(desiredSkillRank(18, late)).toBe(0);
    expect(desiredSkillRank(19, late)).toBe(1);
  });

  it('ranks up every SKILL_RANK_STEP levels after unlock', () => {
    expect(desiredSkillRank(19 + SKILL_RANK_STEP - 1, late)).toBe(1);
    expect(desiredSkillRank(19 + SKILL_RANK_STEP, late)).toBe(2);
    expect(desiredSkillRank(19 + SKILL_RANK_STEP * 2, late)).toBe(3);
  });

  it('caps at maxLevel for high character levels', () => {
    expect(desiredSkillRank(46, late)).toBe(3);
    expect(desiredSkillRank(46, early)).toBe(3);
  });

  it('starter without unlockLevel only ranks if already learned', () => {
    expect(desiredSkillRank(46, starter)).toBe(0);
    expect(desiredSkillRank(46, starter, { alreadyLearned: true })).toBe(3);
    expect(desiredSkillRank(1, starter, { alreadyLearned: true })).toBe(1);
    expect(desiredSkillRank(4, starter, { alreadyLearned: true })).toBe(2);
  });

  it('mad dualist uses own scale', () => {
    const dual = skill({ id: MAD_DUALIST_ID, unlockLevel: 30, maxLevel: 20 });
    expect(desiredSkillRank(29, dual)).toBe(0);
    expect(desiredSkillRank(30, dual)).toBe(1);
    expect(desiredSkillRank(40, dual)).toBe(2);
    expect(desiredSkillRank(46, dual)).toBe(2);
  });
});

describe('nextSkillRankAtLevel', () => {
  it('returns character level for next rank', () => {
    const s = skill({ id: 'x', unlockLevel: 10, maxLevel: 3 });
    expect(nextSkillRankAtLevel(s, 1)).toBe(13);
    expect(nextSkillRankAtLevel(s, 2)).toBe(16);
    expect(nextSkillRankAtLevel(s, 3)).toBeNull();
  });
});

describe('unlockSkillsForLevel catch-up', () => {
  it('raises stuck 1/3 skills for high-level save', () => {
    const save = baseSave({
      level: 46,
      profession: 'rogue',
      skillLevels: {
        acrobatic_move: 1,
        boost_evasion: 1,
        backstab: 1,
        shadow_veil: 1,
        mad_dualist: 1,
      },
    });
    const { save: next } = unlockSkillsForLevel(save);
    expect(next.skillLevels.acrobatic_move).toBe(3);
    expect(next.skillLevels.shadow_veil).toBe(3);
    expect(next.skillLevels.mad_dualist).toBeGreaterThanOrEqual(2);
  });
});

describe('profession skill roster (40–65 content)', () => {
  it('each class has ≥30 skills and ≥10 unlocking at 40+', () => {
    for (const profession of ['warrior', 'rogue', 'mystic', 'archer'] as const) {
      const skills = skillsForProfession(profession);
      expect(skills.length, profession).toBeGreaterThanOrEqual(30);
      const high = skills.filter((s) => (s.unlockLevel ?? 0) >= 40);
      expect(high.length, `${profession} high`).toBeGreaterThanOrEqual(10);
      expect(Math.max(...skills.map((s) => s.unlockLevel ?? 0)), profession).toBeGreaterThanOrEqual(65);
    }
  });

  it('level 65 unlocks apex skills for warrior', () => {
    const save = baseSave({ level: 65, profession: 'warrior', skillLevels: { weapon_mastery: 1 } });
    const { save: next, unlocked } = unlockSkillsForLevel(save);
    expect(next.skillLevels.apex_warrior).toBeGreaterThanOrEqual(1);
    expect(next.skillLevels.worldbreaker).toBeGreaterThanOrEqual(1);
    expect(unlocked.length).toBeGreaterThan(0);
  });
});

describe('common survival/craft skills', () => {
  it('are available to every profession', () => {
    const warrior = skillsForSave(baseSave({ profession: 'warrior', level: 5 }));
    const mystic = skillsForSave(baseSave({ profession: 'mystic', level: 5 }));
    expect(warrior.some((s) => s.id === 'field_hardiness')).toBe(true);
    expect(mystic.some((s) => s.id === 'leather_craft')).toBe(true);
    expect(skillDomain(warrior.find((s) => s.id === 'field_hardiness')!)).toBe('survival');
    expect(skillDomain(warrior.find((s) => s.id === 'leather_craft')!)).toBe('craft');
  });

  it('unlock with character level', () => {
    const save = baseSave({ profession: 'archer', level: 1, skillLevels: {} });
    const { save: next } = unlockSkillsForLevel(save);
    expect(next.skillLevels.field_hardiness).toBeGreaterThan(0);
    expect(next.skillLevels.leather_craft).toBeGreaterThan(0);
  });
});
