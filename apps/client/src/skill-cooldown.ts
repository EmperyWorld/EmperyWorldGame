import type { PlayerSave, SkillDefinition } from './api.js';

/** Parsed cooldownUntil ms — avoid `new Date(...)` on every HUD/combat tick. */
const cooldownUntilMs = new WeakMap<SkillDefinition, number>();

/** Merge save.skillCooldowns into in-memory skill defs (API fields cooldownUntil). */
export function syncSkillCooldownsFromSave(
  skills: SkillDefinition[],
  save: Pick<PlayerSave, 'skillCooldowns'>,
): void {
  for (const skill of skills) {
    const raw = save.skillCooldowns[skill.id] ?? null;
    skill.cooldownUntil = raw;
    if (raw) {
      const ms = Date.parse(raw);
      if (Number.isFinite(ms)) cooldownUntilMs.set(skill, ms);
      else cooldownUntilMs.delete(skill);
    } else {
      cooldownUntilMs.delete(skill);
    }
  }
}

function untilMs(skill: SkillDefinition): number {
  const cached = cooldownUntilMs.get(skill);
  if (cached != null) return cached;
  if (!skill.cooldownUntil) return 0;
  const ms = Date.parse(skill.cooldownUntil);
  if (!Number.isFinite(ms)) return 0;
  cooldownUntilMs.set(skill, ms);
  return ms;
}

export function skillCooldownSec(skill: SkillDefinition, nowMs = Date.now()): number {
  const until = untilMs(skill);
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - nowMs) / 1000));
}

/** 0 = ready, 1 = just used (for sweep overlay). */
export function skillCooldownProgress(skill: SkillDefinition, nowMs = Date.now()): number {
  if (!skill.cooldownMs) return 0;
  const until = untilMs(skill);
  if (!until) return 0;
  const remaining = until - nowMs;
  if (remaining <= 0) return 0;
  return Math.min(1, remaining / skill.cooldownMs);
}

export function hasAnySkillCooldown(skills: SkillDefinition[], nowMs = Date.now()): boolean {
  for (const s of skills) {
    if (skillCooldownSec(s, nowMs) > 0) return true;
  }
  return false;
}
