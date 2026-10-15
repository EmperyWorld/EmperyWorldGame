import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuthService, AuthStorageError } from './auth.js';
import { PostgresAuthRepository, sessionDigest } from './persistence/auth-repository.js';
describe.runIf(process.env.RUN_PERSISTENCE_TESTS==='1')('PostgreSQL authentication',()=>{
 const database=`ewg_auth_${randomUUID().replaceAll('-','')}`;let control:pg.Pool,pool:pg.Pool,root:string,repository:PostgresAuthRepository,auth:AuthService,token:string,accountId:string;
 beforeAll(async()=>{
  const url=new URL(process.env.EMPERY_POSTGRES_URL!);control=new pg.Pool({connectionString:url.toString()});await control.query(`CREATE DATABASE "${database}"`);url.pathname=`/${database}`;pool=new pg.Pool({connectionString:url.toString()});await pool.query(readFileSync(new URL('../../../../deploy/podman/init/01-schema.sql',import.meta.url),'utf8'));
  root=mkdtempSync(join(tmpdir(),'ewg-auth-db-'));const files=new AuthService(join(root,'accounts.json'),join(root,'sessions.json'));
  const result=await files.register('legacy_keeper','secret123');if('error' in result)throw new Error('legacy fixture');token=result.token;accountId=result.account.id;files.attachSave(accountId,'legacy-save');files.setAdmin('legacy_keeper',true);
  repository=new PostgresAuthRepository(pool);auth=await AuthService.postgres(join(root,'accounts.json'),join(root,'sessions.json'),repository);
 },15000);
 afterAll(async()=>{vi.restoreAllMocks();await pool?.end();if(control){await control.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);await control.end();}if(root)rmSync(root,{recursive:true,force:true});});
 it('imports passwords, ownership, admin and existing sessions without storing bearer tokens',async()=>{
  expect(auth.resolveToken(token)?.accountId).toBe(accountId);expect(auth.ownsSave(accountId,'legacy-save')).toBe(true);expect(auth.isAdmin(accountId)).toBe(true);
  const rows=(await pool.query('SELECT token_hash FROM game_auth_sessions')).rows;expect(rows.map(r=>r.token_hash)).toContain(sessionDigest(token));expect(rows.map(r=>r.token_hash)).not.toContain(token);
  const login=await auth.login('legacy_keeper','secret123');expect('token' in login).toBe(true);
 });
 it('uses the database after restart and never reimports retained or corrupted JSON',async()=>{
  auth.detachSave(accountId,'legacy-save');auth.setAdmin('legacy_keeper',false);auth.logout(token);await auth.flush();
  writeFileSync(join(root,'accounts.json'),'{broken');writeFileSync(join(root,'sessions.json'),'{broken');
  auth=await AuthService.postgres(join(root,'accounts.json'),join(root,'sessions.json'),repository);expect(auth.resolveToken(token)).toBeNull();expect(auth.isAdmin(accountId)).toBe(false);expect(auth.ownsSave(accountId,'legacy-save')).toBe(false);
 });
 it('handles concurrent registrations without losing users or acknowledging duplicate accounts',async()=>{
  const results=await Promise.all([auth.register('parallel_db','secret123'),auth.register('parallel_db','secret123'),auth.register('other_db','secret123')]);expect(results.filter(r=>'account' in r)).toHaveLength(2);expect(results.filter(r=>'error' in r)).toHaveLength(1);expect(auth.healthy()).toBe(true);
  await auth.refresh();expect((await pool.query("SELECT count(*)::int AS n FROM game_accounts WHERE username IN ('parallel_db','other_db')")).rows[0].n).toBe(2);
 });
 it('refreshes external admin changes and does not overwrite them while attaching saves',async()=>{
  await repository.setAdmin(accountId,true);await auth.refresh();auth.attachSave(accountId,'new-save');await auth.flush();await auth.refresh();expect(auth.isAdmin(accountId)).toBe(true);expect(auth.ownsSave(accountId,'new-save')).toBe(true);
 });
 it('retains only unexpired sessions and persists logout across independent services',async()=>{
  const login=await auth.login('legacy_keeper','secret123');if('error' in login)throw new Error('login');auth.logout(login.token);await auth.flush();const other=await AuthService.postgres(join(root,'accounts.json'),join(root,'sessions.json'),repository);expect(other.resolveToken(login.token)).toBeNull();
 });
 it('rolls back account creation when its initial session cannot be stored',async()=>{
  const id=randomUUID();const account={id,username:'rollback_user',passwordHash:'a'.repeat(128),salt:'b'.repeat(32),saveIds:[],createdAt:new Date().toISOString()};
  await expect(repository.register(account,{token:'c'.repeat(64),accountId:id,username:account.username,createdAt:100,expiresAt:50})).rejects.toThrow();
  expect((await pool.query('SELECT 1 FROM game_accounts WHERE id=$1',[id])).rowCount).toBe(0);
 });
 it('fails closed on a database write failure without acknowledging a session',async()=>{
  vi.spyOn(repository,'insertSession').mockRejectedValueOnce(new Error('disk failed'));await expect(auth.login('legacy_keeper','secret123')).rejects.toBeInstanceOf(AuthStorageError);expect(auth.healthy()).toBe(false);vi.restoreAllMocks();
 });
});
