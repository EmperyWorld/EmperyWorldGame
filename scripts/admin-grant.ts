import { loadServicesConfig } from '@empery/shared/config';
import { PostgresAuthRepository } from '../apps/server/src/services/persistence/auth-repository.js';
import pg from 'pg';
/**
 * Выдать/снять флаг admin аккаунту.
 *
 *   pnpm admin:grant -- --user=name
 *   pnpm admin:grant -- --user=name --revoke
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthService, accountsFilePath, sessionsFilePath } from '../apps/server/src/services/auth.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const user = argValue('user');
if (!user?.trim()) {
  console.error('Usage: pnpm admin:grant -- --user=username [--revoke]');
  process.exit(1);
}

const config=loadServicesConfig();
const pool=config.save.backend==='files'?null:new pg.Pool({connectionString:config.persistence?.postgres?.url});
const auth=pool?await AuthService.postgres(accountsFilePath(rootDir),sessionsFilePath(rootDir),new PostgresAuthRepository(pool)):new AuthService(accountsFilePath(rootDir), sessionsFilePath(rootDir));
const revoke = hasFlag('revoke');
const result = auth.setAdmin(user.trim(), !revoke);
if (!result) {
  console.error(`Аккаунт "${user.trim()}" не найден. Сначала зарегистрируйтесь в игре.`);
  await pool?.end();process.exit(1);
}
await auth.flush();await pool?.end();

console.log(
  revoke
    ? `Admin снят с "${result.username}"`
    : `Admin выдан "${result.username}" (id=${result.id})`,
);
