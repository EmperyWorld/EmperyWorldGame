import { describe, expect, it } from 'vitest';
import type { SkillDefinition } from './api.js';
import {
  hasAnySkillCooldown,
  skillCooldownProgress,
  skillCooldownSec,
  syncSkillCooldownsFromSave,
} from './skill-cooldown.js';

function skill(partial: Partial<SkillDefinition> & Pick<SkillDefinition, 'id'>): SkillDefinition {
  return {
    name: partial.id,
    description: '',
    type: 'active',
    profession: 'warrior',
    maxLevel: 3,
    level: 1,
    cooldownMs: 10_000,
    ...partial,
  };
}

describe('syncSkillCooldownsFromSave', () => {
  it('copies save.skillCooldowns into skill.cooldownUntil', () => {
    const until = '2030-01-01T00:00:10.000Z';
    const skills = [skill({ id: 'power_strike' })];
    syncSkillCooldownsFromSave(skills, { skillCooldowns: { power_strike: until } });
    expect(skills[0]!.cooldownUntil).toBe(until);
  });

  it('clears cooldownUntil when save has no entry', () => {
    const skills = [skill({ id: 'power_strike', cooldownUntil: '2030-01-01T00:00:10.000Z' })];
    syncSkillCooldownsFromSave(skills, { skillCooldowns: {} });
    expect(skills[0]!.cooldownUntil).toBeNull();
  });
});

describe('skillCooldownSec', () => {
  it('returns remaining whole seconds', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const s = skill({
      id: 'a',
      cooldownUntil: new Date(now + 2500).toISOString(),
    });
    expect(skillCooldownSec(s, now)).toBe(3);
  });

  it('returns 0 when cooldown expired', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const s = skill({
      id: 'a',
      cooldownUntil: new Date(now - 1).toISOString(),
    });
    expect(skillCooldownSec(s, now)).toBe(0);
  });
});

describe('skillCooldownProgress', () => {
  it('returns fraction of cooldownMs remaining', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const s = skill({
      id: 'a',
      cooldownMs: 10_000,
      cooldownUntil: new Date(now + 5000).toISOString(),
    });
    expect(skillCooldownProgress(s, now)).toBeCloseTo(0.5, 3);
  });
});

describe('hasAnySkillCooldown', () => {
  it('is true when any skill is on cooldown', () => {
    const now = Date.now();
    const skills = [
      skill({ id: 'a', cooldownUntil: new Date(now + 5000).toISOString() }),
      skill({ id: 'b' }),
    ];
    expect(hasAnySkillCooldown(skills, now)).toBe(true);
  });
});
