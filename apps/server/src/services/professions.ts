import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProfessionDefinition } from '@empery/shared';
import { contentRoot } from './paths.js';

let professionsList: ProfessionDefinition[] | null = null;
let professionsById: Map<string, ProfessionDefinition> | null = null;

function ensureProfessionsCache(): void {
  if (professionsList && professionsById) return;
  const dir = join(contentRoot, 'professions');
  professionsList = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => parseYaml(readFileSync(join(dir, name), 'utf8')) as ProfessionDefinition);
  professionsById = new Map(professionsList.map((profession) => [profession.id, profession]));
}

export function loadProfessions(): ProfessionDefinition[] {
  ensureProfessionsCache();
  return professionsList!;
}

export function getProfession(id: string): ProfessionDefinition | undefined {
  ensureProfessionsCache();
  return professionsById!.get(id);
}

export function starterSkillsFor(
  professionId: string,
  raceId?: string,
): Record<string, number> {
  const prof = getProfession(professionId);
  if (!prof) return {};
  const base = { ...prof.starterSkills };
  if (raceId && prof.starterSkillsByRace?.[raceId]) {
    return { ...base, ...prof.starterSkillsByRace[raceId] };
  }
  return base;
}

/** Tests / content hot-reload — discard parsed profession YAML. */
export function clearProfessionsCache(): void {
  professionsList = null;
  professionsById = null;
}
