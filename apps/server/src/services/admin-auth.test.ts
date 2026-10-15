import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthService } from './auth.js';

describe('admin flag', () => {
  function fresh(): { auth: AuthService; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'empery-admin-auth-'));
    const auth = new AuthService(join(dir, 'accounts.json'), join(dir, 'sessions.json'));
    return { auth, dir };
  }

  it('setAdmin and bootstrapAdminFromEnv', async () => {
    const { auth, dir } = fresh();
    try {
      const reg = await auth.register('admin_user', 'secret12');
      expect('token' in reg).toBe(true);
      if (!('token' in reg)) return;
      expect(reg.account.admin).toBeUndefined();

      const granted = auth.setAdmin('Admin_User', true);
      expect(granted?.admin).toBe(true);
      expect(auth.isAdmin(reg.account.id)).toBe(true);

      const boot = auth.bootstrapAdminFromEnv('admin_user');
      expect(boot?.admin).toBe(true);

      const missing = auth.bootstrapAdminFromEnv('nobody_here');
      expect(missing).toBeNull();

      auth.setAdmin('admin_user', false);
      expect(auth.isAdmin(reg.account.id)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('toPublic exposes admin when set', async () => {
    const { auth, dir } = fresh();
    try {
      const reg = await auth.register('boss', 'secret12');
      if (!('token' in reg)) return;
      auth.setAdmin('boss', true);
      const account = auth.getAccount(reg.account.id)!;
      expect(auth.toPublic(account).admin).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
