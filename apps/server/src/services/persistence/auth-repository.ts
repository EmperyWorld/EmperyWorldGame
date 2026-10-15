import pg from 'pg';
import { createHash } from 'node:crypto';
import type { AccountRecord, AuthSession } from '../auth.js';
export const sessionDigest=(token:string):string=>createHash('sha256').update(token).digest('hex');
export class PostgresAuthRepository {
 constructor(private readonly pool:pg.Pool){}
 async migrationApplied():Promise<boolean>{return (await this.pool.query("SELECT 1 FROM game_storage_migrations WHERE name='file-auth-v1'")).rowCount===1;}
 async migrate(accounts:AccountRecord[],sessions:AuthSession[]):Promise<void>{
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(734281,2)');
   if((await client.query("SELECT 1 FROM game_storage_migrations WHERE name='file-auth-v1'")).rowCount){await client.query('COMMIT');return;}
   for(const account of accounts)await client.query('INSERT INTO game_accounts(id,username,password_hash,salt,save_ids,created_at,admin) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[account.id,account.username,account.passwordHash,account.salt,account.saveIds,account.createdAt,Boolean(account.admin)]);
   for(const session of sessions)if(session.expiresAt>Date.now())await client.query('INSERT INTO game_auth_sessions(token_hash,account_id,created_at,expires_at) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM game_accounts WHERE id=$2) ON CONFLICT DO NOTHING',[sessionDigest(session.token),session.accountId,session.createdAt,session.expiresAt]);
   await client.query("INSERT INTO game_storage_migrations(name) VALUES('file-auth-v1')");await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async load():Promise<{accounts:AccountRecord[];sessions:AuthSession[]}>{
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const accounts=(await client.query('SELECT * FROM game_accounts')).rows.map(r=>({id:r.id,username:r.username,passwordHash:r.password_hash,salt:r.salt,saveIds:r.save_ids,createdAt:new Date(r.created_at).toISOString(),admin:r.admin||undefined}));
   const sessions=(await client.query('SELECT s.*,a.username FROM game_auth_sessions s JOIN game_accounts a ON a.id=s.account_id WHERE s.expires_at>$1',[Date.now()])).rows.map(r=>({token:r.token_hash,accountId:r.account_id,username:r.username,createdAt:Number(r.created_at),expiresAt:Number(r.expires_at)}));
   await client.query('COMMIT');return {accounts,sessions};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async register(a:AccountRecord,s:AuthSession):Promise<void>{
  const client=await this.pool.connect();try{
   await client.query('BEGIN');
   await client.query('INSERT INTO game_accounts(id,username,password_hash,salt,save_ids,created_at,admin) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.id,a.username,a.passwordHash,a.salt,a.saveIds,a.createdAt,Boolean(a.admin)]);
   await client.query('INSERT INTO game_auth_sessions(token_hash,account_id,created_at,expires_at) VALUES($1,$2,$3,$4)',[s.token,s.accountId,s.createdAt,s.expiresAt]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async insertSession(s:AuthSession):Promise<void>{await this.pool.query('INSERT INTO game_auth_sessions(token_hash,account_id,created_at,expires_at) VALUES($1,$2,$3,$4)',[s.token,s.accountId,s.createdAt,s.expiresAt]);}
 async deleteSession(token:string):Promise<void>{await this.pool.query('DELETE FROM game_auth_sessions WHERE token_hash=$1',[token]);}
 async attachSave(id:string,saveId:string):Promise<void>{await this.pool.query('UPDATE game_accounts SET save_ids=array_append(save_ids,$2) WHERE id=$1 AND NOT ($2=ANY(save_ids))',[id,saveId]);}
 async detachSave(id:string,saveId:string):Promise<void>{await this.pool.query('UPDATE game_accounts SET save_ids=array_remove(save_ids,$2) WHERE id=$1',[id,saveId]);}
 async setAdmin(id:string,admin:boolean):Promise<void>{await this.pool.query('UPDATE game_accounts SET admin=$2 WHERE id=$1',[id,admin]);}
 async pruneSessions():Promise<void>{await this.pool.query('DELETE FROM game_auth_sessions WHERE expires_at<=$1',[Date.now()]);}
}
