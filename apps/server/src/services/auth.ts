import { PostgresAuthRepository, sessionDigest } from './persistence/auth-repository.js';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  saveIds: string[];
  createdAt: string;
  /** Доступ к /api/admin и UI админки. */
  admin?: boolean;
}

export interface AuthSession {
  token: string;
  accountId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

export interface PublicAccount {
  id: string;
  username: string;
  saveIds: string[];
  createdAt: string;
  admin?: boolean;
}

interface AccountsFile {
  accounts: AccountRecord[];
}

interface SessionsFile {
  sessions: AuthSession[];
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SCRYPT_KEYLEN = 64;

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const username = normalizeUsername(raw);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return null;
  }
  return username;
}

export function validatePassword(raw: string): boolean {
  return typeof raw === 'string' && raw.length >= 6 && raw.length <= 128;
}

let hashing = 0;
const hashingWaiters: Array<() => void> = [];
export class AuthBusyError extends Error {}
export class AuthStorageError extends Error {}
async function hashPassword(password: string, salt: string): Promise<string> {
  if (hashing >= 4) {
    if (hashingWaiters.length >= 32) throw new AuthBusyError('Слишком много запросов входа');
    await new Promise<void>((resolve) => hashingWaiters.push(resolve));
  } else hashing += 1;
  try {
    return await new Promise<string>((resolve, reject) => {
      scrypt(password, salt, SCRYPT_KEYLEN, (error, key) => {
        if (error) reject(error); else resolve(key.toString('hex'));
      });
    });
  } finally {
    const next = hashingWaiters.shift();
    if (next) next(); else hashing -= 1;
  }
}

function writeAtomic(path: string, value: unknown): void {
  if (existsSync(path)) {
    if (Object.hasOwn(value as object,'accounts')) readAccounts(path);
    else readSessions(path);
  }
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  renameSync(tmp, path);
}

function readAccounts(path: string): AccountRecord[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as AccountsFile;
  if (!raw || !Array.isArray(raw.accounts)) throw new Error('Invalid accounts file');
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const account of raw.accounts) {
    if (!account || typeof account.id !== 'string' || !account.id ||
        typeof account.username !== 'string' || !validateUsername(account.username) ||
        typeof account.salt !== 'string' || !/^[a-f0-9]{32}$/.test(account.salt) ||
        typeof account.passwordHash !== 'string' || !/^[a-f0-9]{128}$/.test(account.passwordHash) ||
        !Array.isArray(account.saveIds) || !account.saveIds.every(id => typeof id === 'string') ||
        ids.has(account.id) || names.has(account.username)) throw new Error('Invalid account record');
    ids.add(account.id); names.add(account.username);
  }
  return raw.accounts;
}

function readSessions(path: string): AuthSession[] {
  const raw = JSON.parse(readFileSync(path,'utf8')) as SessionsFile;
  if (!raw || !Array.isArray(raw.sessions)) throw new Error('Invalid sessions file');
  for (const session of raw.sessions) {
    if (!session || typeof session.token !== 'string' || typeof session.accountId !== 'string' || !Number.isFinite(session.expiresAt) || !Number.isFinite(session.createdAt)) throw new Error('Invalid session record');
  }
  return raw.sessions;
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function publicAccount(account: AccountRecord): PublicAccount {
  return {
    id: account.id,
    username: account.username,
    saveIds: [...account.saveIds],
    createdAt: account.createdAt,
    admin: account.admin ? true : undefined,
  };
}

export class AuthService {
  private accounts = new Map<string, AccountRecord>();
  private byUsername = new Map<string, string>();
  private sessions = new Map<string, AuthSession>();
  private readonly sessionsPath: string;
  private pending:Promise<void>=Promise.resolve();
  private failure:unknown;
  private refreshing:Promise<void>|null=null;
  private enqueue(fn:()=>Promise<void>):void {
    this.pending=this.pending.then(async()=>{if(this.failure)throw this.failure;await fn();}).catch(error=>{this.failure=error;});
  }
  healthy():boolean{return !this.failure;}
  async flush():Promise<void>{await this.pending;if(this.failure)throw new AuthStorageError('Authentication storage unavailable');}
  async refresh():Promise<void>{
    if(!this.repository)return;
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{
      try{
        for(;;){await this.flush();const pending=this.pending;const records=await this.repository!.load();if(pending!==this.pending)continue;this.replaceAccounts(records.accounts);this.sessions=new Map(records.sessions.map(s=>[s.token,s]));break;}
      }
      catch(error){this.failure=error;throw new AuthStorageError('Authentication storage unavailable');}
    })().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  static async postgres(filePath:string,sessionsPath:string,repository:PostgresAuthRepository):Promise<AuthService>{
    if(!await repository.migrationApplied())await repository.migrate(existsSync(filePath)?readAccounts(filePath):[],existsSync(sessionsPath)?readSessions(sessionsPath):[]);
    const service=new AuthService(filePath,sessionsPath,repository);await service.refresh();return service;
  }
  private tokenKey(token:string):string{return this.repository?sessionDigest(token):token;}


  constructor(private readonly filePath: string, sessionsPath?: string, private readonly repository?:PostgresAuthRepository) {
    this.sessionsPath = sessionsPath ?? join(dirname(filePath), 'sessions.json');
    if(repository)return;
    mkdirSync(dirname(filePath), { recursive: true });
    this.load();
    this.loadSessions();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.persist();
      return;
    }
    this.replaceAccounts(readAccounts(this.filePath));
  }

  private replaceAccounts(records: AccountRecord[]): void {
    this.accounts = new Map(records.map(account => [account.id, account]));
    this.byUsername = new Map(records.map(account => [account.username, account.id]));
  }

  /** Reload only fully validated data; an unreadable file never destroys live accounts. */
  reloadAccountsFromDisk(): void {
    if (!this.repository && existsSync(this.filePath)) this.replaceAccounts(readAccounts(this.filePath));
  }

  private loadSessions(): void {
    if (!existsSync(this.sessionsPath)) {
      this.persistSessions();
      return;
    }
    const now=Date.now();
    for (const session of readSessions(this.sessionsPath)) {
      if (now <= session.expiresAt && this.accounts.has(session.accountId)) this.sessions.set(session.token,session);
    }
  }

  private persist(): void {
    const payload: AccountsFile = {
      accounts: [...this.accounts.values()],
    };
    writeAtomic(this.filePath, payload);
  }

  private persistSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions) {
      if (now > session.expiresAt || !this.accounts.has(session.accountId)) {
        this.sessions.delete(token);
      }
    }
    const payload: SessionsFile = {
      sessions: [...this.sessions.values()],
    };
    writeAtomic(this.sessionsPath, payload);
  }

  getAccount(accountId: string): AccountRecord | null {
    return this.accounts.get(accountId) ?? null;
  }

  toPublic(account: AccountRecord): PublicAccount {
    return publicAccount(account);
  }

  async register(usernameRaw: string, password: string): Promise<{ account: PublicAccount; token: string } | { error: string; code: string }> {
    await this.refresh();
    const username = validateUsername(usernameRaw);
    if (!username) {
      return { error: 'Логин: 3–24 символа, латиница/цифры/_', code: 'BAD_USERNAME' };
    }
    if (!validatePassword(password)) {
      return { error: 'Пароль: минимум 6 символов', code: 'BAD_PASSWORD' };
    }
    if (this.byUsername.has(username)) {
      return { error: 'Такой логин уже занят', code: 'USERNAME_TAKEN' };
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = await hashPassword(password, salt);
    this.reloadAccountsFromDisk();
    if (this.byUsername.has(username)) return { error: 'Такой логин уже занят', code: 'USERNAME_TAKEN' };
    const account: AccountRecord = {
      id: randomBytes(16).toString('hex'),
      username,
      salt,
      passwordHash,
      saveIds: [],
      createdAt: new Date().toISOString(),
    };
    if(this.repository){
      const issued=this.issueSession(account);
      try{await this.repository.register(account,issued.session);}catch(error){
        if((error as {code?:string}).code==='23505')return {error:'Такой логин уже занят',code:'USERNAME_TAKEN'};
        this.failure=error;throw new AuthStorageError('Authentication storage unavailable');
      }
      this.accounts.set(account.id,account);this.byUsername.set(username,account.id);this.sessions.set(issued.session.token,issued.session);return {account:publicAccount(account),token:issued.token};
    }
    this.accounts.set(account.id, account);
    this.byUsername.set(username, account.id);
    this.persist();
    const token = this.createSession(account);
    await this.flush();
    return { account: publicAccount(account), token };
  }

  async login(usernameRaw: string, password: string): Promise<{ account: PublicAccount; token: string } | { error: string; code: string }> {
    await this.refresh();
    this.reloadAccountsFromDisk();
    if (typeof usernameRaw !== 'string') return {error:'Неверный логин или пароль',code:'AUTH_FAILED'};
    const username = normalizeUsername(usernameRaw);
    const accountId = this.byUsername.get(username);
    if (!accountId) {
      return { error: 'Неверный логин или пароль', code: 'AUTH_FAILED' };
    }
    const account = this.accounts.get(accountId);
    if (!account) {
      return { error: 'Неверный логин или пароль', code: 'AUTH_FAILED' };
    }
    if (!validatePassword(password)) return { error: 'Неверный логин или пароль', code: 'AUTH_FAILED' };
    const hash = await hashPassword(password, account.salt);
    if (!safeEqualHex(hash, account.passwordHash)) {
      return { error: 'Неверный логин или пароль', code: 'AUTH_FAILED' };
    }
    const token = this.createSession(account);
    await this.flush();
    return { account: publicAccount(account), token };
  }

  logout(token: string): void {
    token=this.tokenKey(token);
    if (!this.sessions.has(token)) return;
    this.sessions.delete(token);
    if(this.repository)this.enqueue(()=>this.repository!.deleteSession(token));else this.persistSessions();
  }

  resolveToken(token: string | null | undefined): AuthSession | null {
    if (!token) return null;
    token=this.tokenKey(token);
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      if(this.repository)this.enqueue(()=>this.repository!.deleteSession(token!));else this.persistSessions();
      return null;
    }
    if (!this.accounts.has(session.accountId)) {
      this.sessions.delete(token);
      if(this.repository)this.enqueue(()=>this.repository!.deleteSession(token!));else this.persistSessions();
      return null;
    }
    return session;
  }

  ownsSave(accountId: string, saveId: string): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;
    return account.saveIds.includes(saveId);
  }

  attachSave(accountId: string, saveId: string): void {
    const account = this.accounts.get(accountId);
    if (!account) return;
    if (!account.saveIds.includes(saveId)) {
      account.saveIds.push(saveId);
      if(this.repository)this.enqueue(()=>this.repository!.attachSave(accountId,saveId));else this.persist();
    }
  }

  detachSave(accountId: string, saveId: string): void {
    const account = this.accounts.get(accountId);
    if (!account) return;
    if (!account.saveIds.includes(saveId)) return;
    account.saveIds = account.saveIds.filter((id) => id !== saveId);
    if(this.repository)this.enqueue(()=>this.repository!.detachSave(accountId,saveId));else this.persist();
  }

  isAdmin(accountId: string): boolean {
    return Boolean(this.accounts.get(accountId)?.admin);
  }

  /** Выдать/снять admin. Возвращает public account или null если не найден. */
  setAdmin(usernameRaw: string, admin: boolean): PublicAccount | null {
    if (typeof usernameRaw !== 'string') return null;
    const username = normalizeUsername(usernameRaw);
    const accountId = this.byUsername.get(username);
    if (!accountId) return null;
    const account = this.accounts.get(accountId);
    if (!account) return null;
    account.admin = admin || undefined;
    if(this.repository)this.enqueue(()=>this.repository!.setAdmin(account.id,admin));else this.persist();
    return publicAccount(account);
  }

  /** EMPERY_BOOTSTRAP_ADMIN=username — выставить admin если аккаунт есть. */
  bootstrapAdminFromEnv(envValue: string | undefined): PublicAccount | null {
    if (!envValue?.trim()) return null;
    return this.setAdmin(envValue.trim(), true);
  }

  private issueSession(account:AccountRecord):{token:string;session:AuthSession} {
    const token = createHash('sha256')
      .update(`${account.id}:${randomBytes(32).toString('hex')}:${Date.now()}`)
      .digest('hex');
    const now = Date.now();
    const key=this.tokenKey(token);
    const session={
      token:key,
      accountId: account.id,
      username: account.username,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };
    return {token,session};
  }
  private createSession(account:AccountRecord):string {
    const {token,session}=this.issueSession(account);
    this.sessions.set(session.token,session);
    if(this.repository)this.enqueue(()=>this.repository!.insertSession(session));else this.persistSessions();
    return token;
  }
}

export function accountsFilePath(rootDir: string): string {
  return join(rootDir, 'data', 'accounts.json');
}

export function sessionsFilePath(rootDir: string): string {
  return join(rootDir, 'data', 'sessions.json');
}
