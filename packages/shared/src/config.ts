import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ServicesConfigSchema, type ServicesConfig } from './types.js';

const packageDir = dirname(fileURLToPath(import.meta.url));

function findConfigPath(): string {
  const candidates = [
    join(process.cwd(), 'config/services.yaml'),
    join(process.cwd(), '../../config/services.yaml'),
    join(packageDir, '../../../config/services.yaml'),
  ];

  for (const candidate of candidates) {
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error('config/services.yaml not found');
}

let cachedConfig: ServicesConfig | null = null;

export function loadServicesConfig(): ServicesConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = findConfigPath();
  const raw = parseYaml(readFileSync(configPath, 'utf8'));
  const config = ServicesConfigSchema.parse(raw);
  if (process.env.EMPERY_POSTGRES_URL) config.persistence = { ...config.persistence, postgres: { ...config.persistence?.postgres, enabled: true, url: process.env.EMPERY_POSTGRES_URL } };
  if (process.env.EMPERY_REDIS_URL) config.persistence = { ...config.persistence, redis: { ...config.persistence?.redis, enabled: true, url: process.env.EMPERY_REDIS_URL } };
  cachedConfig = ServicesConfigSchema.parse(config);
  return cachedConfig;
}

export function resetServicesConfigCache(): void {
  cachedConfig = null;
}
