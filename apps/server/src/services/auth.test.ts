import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthService } from './auth.js';
import { SaveManager } from '@empery/save';

describe('AuthService', () => {
  function fresh(): { auth: AuthService; dir: string; accountsPath: string; sessionsPath: string } {
    const dir = mkdtempSync(join(tmpdir(), 'empery-auth-'));
    const accountsPath = join(dir, 'accounts.json');
    const sessionsPath = join(dir, 'sessions.json');
    const auth = new AuthService(accountsPath, sessionsPath);
    return { auth, dir, accountsPath, sessionsPath };
  }

  it('registers and logs in with password', async () => {
    const { auth, dir } = fresh();
    try {
      const reg = await auth.register('Hero_1', 'secret12');
      expect('token' in reg).toBe(true);
      if (!('token' in reg)) return;
      expect(reg.account.username).toBe('hero_1');

      const bad = await auth.login('hero_1', 'wrong');
      expect('error' in bad).toBe(true);

      const ok = await auth.login('HERO_1', 'secret12');
      expect('token' in ok).toBe(true);
      if (!('token' in ok)) return;
      const session = auth.resolveToken(ok.token);
      expect(session?.accountId).toBe(reg.account.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate usernames', async () => {
    const { auth, dir } = fresh();
    try {
      await auth.register('mira', 'secret12');
      const again = await auth.register('Mira', 'secret99');
      expect('error' in again).toBe(true);
      if ('error' in again) expect(again.code).toBe('USERNAME_TAKEN');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tracks save ownership', async () => {
    const { auth, dir } = fresh();
    try {
      const reg = await auth.register('owner', 'secret12');
      if (!('token' in reg)) return;
      auth.attachSave(reg.account.id, 'save-a');
      expect(auth.ownsSave(reg.account.id, 'save-a')).toBe(true);
      expect(auth.ownsSave(reg.account.id, 'save-b')).toBe(false);
      auth.detachSave(reg.account.id, 'save-a');
      expect(auth.ownsSave(reg.account.id, 'save-a')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists sessions across restart', async () => {
    const { auth, dir, accountsPath, sessionsPath } = fresh();
    try {
      const reg = await auth.register('keeper', 'secret12');
      if (!('token' in reg)) return;
      const token = reg.token;

      const reloaded = new AuthService(accountsPath, sessionsPath);
      const session = reloaded.resolveToken(token);
      expect(session?.username).toBe('keeper');
      expect(session?.accountId).toBe(reg.account.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('claims orphan saves onto account', async () => {
    const { auth, dir } = fresh();
    try {
      const saves = new SaveManager(join(dir, 'saves'));
      const orphan = saves.create({ name: 'Старый', race: 'human', profession: 'warrior' });
      expect(orphan.accountId).toBeUndefined();
      expect(saves.listOrphans().some((s) => s.id === orphan.id)).toBe(true);

      const reg = await auth.register('claimer', 'secret12');
      if (!('token' in reg)) return;

      const stamped = saves.save({ ...orphan, accountId: reg.account.id });
      auth.attachSave(reg.account.id, stamped.id);
      expect(auth.ownsSave(reg.account.id, stamped.id)).toBe(true);
      expect(saves.listOrphans().some((s) => s.id === orphan.id)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('preserves corrupt accounts and fails closed', () => {
    const {dir,accountsPath,sessionsPath}=fresh();
    try {
      const bytes='{broken json';writeFileSync(accountsPath,bytes);
      expect(()=>new AuthService(accountsPath,sessionsPath)).toThrow();
      expect(readFileSync(accountsPath,'utf8')).toBe(bytes);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it('keeps existing live accounts when a reload fails and writes backups atomically', async () => {
    const {auth,dir,accountsPath}=fresh();
    try {
      const result=await auth.register('atomic','secret12');
      expect('account' in result).toBe(true);if(!('account' in result))throw new Error('register failed');
      expect(existsSync(`${accountsPath}.bak`)).toBe(true);
      writeFileSync(accountsPath,'{broken');
      expect(()=>auth.reloadAccountsFromDisk()).toThrow();
      expect(auth.getAccount(result.account.id)?.username).toBe('atomic');
      expect(readFileSync(accountsPath,'utf8')).toBe('{broken');
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it('serializes duplicate registration after asynchronous hashing', async () => {
    const {auth,dir}=fresh();
    try {
      const results=await Promise.all([auth.register('parallel','secret12'),auth.register('parallel','secret12')]);
      expect(results.filter(result=>'account' in result)).toHaveLength(1);
      expect(results.filter(result=>'error' in result)).toHaveLength(1);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it('preserves corrupt runtime files and the last good backup on mutation', async () => {
    const {auth,dir,accountsPath,sessionsPath}=fresh();
    try {
      const result=await auth.register('runtime','secret12');if(!('account' in result))throw new Error('register failed');
      const accountsBackup=readFileSync(`${accountsPath}.bak`,'utf8');
      writeFileSync(accountsPath,'{broken accounts');
      expect(()=>auth.attachSave(result.account.id,'new-save')).toThrow();
      expect(readFileSync(accountsPath,'utf8')).toBe('{broken accounts');expect(readFileSync(`${accountsPath}.bak`,'utf8')).toBe(accountsBackup);
      const sessionsBackup=readFileSync(`${sessionsPath}.bak`,'utf8');
      writeFileSync(sessionsPath,'{broken sessions');
      expect(()=>auth.logout(result.token)).toThrow();
      expect(readFileSync(sessionsPath,'utf8')).toBe('{broken sessions');expect(readFileSync(`${sessionsPath}.bak`,'utf8')).toBe(sessionsBackup);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
});
