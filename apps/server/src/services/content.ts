import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { applyMediaCacheBust } from './media-manifest-cache-bust.js';
import { contentRoot } from './paths.js';

export interface RaceDefinition {
  id: string;
  name: string;
  description: string;
  bonuses: Record<string, number>;
  startLocation: string;
  mediaProfile: string;
  portraitAsset?: string;
  dialogueStyle: string;
}

let racesCache: RaceDefinition[] | null = null;
export function clearRacesCache(): void { racesCache = null; }
export function loadRaces(): RaceDefinition[] {
  if (racesCache) return racesCache;
  const dir = join(contentRoot, 'races');
  racesCache = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => parseYaml(readFileSync(join(dir, name), 'utf8')) as RaceDefinition);
  return racesCache;
}

export function getRace(id: string): RaceDefinition | undefined {
  return loadRaces().find((race) => race.id === id);
}

export function loadMediaManifest(): Record<string, unknown> | null {
  const path = join(contentRoot, 'media/manifest.json');
  if (!existsSync(path)) return null;
  return applyMediaCacheBust(JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>);
}
