import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { EnemyDefinition } from '@empery/shared';
import { scaleEnemyStats, type EnemyStatBlock } from '@empery/shared';
import { contentRoot } from './paths.js';

export type ScaledEnemy = EnemyStatBlock & { id: string; name: string };

/** Глобальный множитель боевых статов (HP / Atk / Def). Hit/speed/XP без изменений. */
export const ENEMY_POWER_MULT = 5;

function applyEnemyPowerMult(raw: EnemyDefinition): EnemyDefinition {
  const m = ENEMY_POWER_MULT;
  return {
    ...raw,
    hp: Math.max(1, Math.round(raw.hp * m)),
    pAtk: Math.max(1, Math.round(raw.pAtk * m)),
    pDef: Math.max(1, Math.round(raw.pDef * m)),
    mDef: raw.mDef != null ? Math.max(1, Math.round(raw.mDef * m)) : raw.mDef,
  };
}

let enemiesList: EnemyDefinition[] | null = null;
let enemiesById: Map<string, EnemyDefinition> | null = null;

function ensureEnemiesCache(): void {
  if (enemiesList && enemiesById) return;
  const dir = join(contentRoot, 'enemies');
  const list = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) =>
      applyEnemyPowerMult(parseYaml(readFileSync(join(dir, name), 'utf8')) as EnemyDefinition),
    );
  const byId = new Map<string, EnemyDefinition>();
  for (const enemy of list) byId.set(enemy.id, enemy);
  enemiesList = list;
  enemiesById = byId;
}

export function loadEnemies(): EnemyDefinition[] {
  ensureEnemiesCache();
  return enemiesList!;
}

export function getEnemy(id: string): EnemyDefinition | undefined {
  ensureEnemiesCache();
  return enemiesById!.get(id);
}

/** Tests / hot-reload — drop cached YAML. */
export function clearEnemiesCache(): void {
  enemiesList = null;
  enemiesById = null;
}

export function getScaledEnemy(id: string, spawnLevel: number): ScaledEnemy | undefined {
  const base = getEnemy(id);
  if (!base) return undefined;
  const scaled = scaleEnemyStats(
    {
      level: base.level ?? 1,
      hp: base.hp,
      pAtk: base.pAtk,
      pDef: base.pDef,
      mDef: base.mDef,
      accuracy: base.accuracy,
      evasion: base.evasion,
      speed: base.speed,
      xpReward: base.xpReward,
    },
    spawnLevel,
  );
  return { id: base.id, name: base.name, ...scaled };
}
