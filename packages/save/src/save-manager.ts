import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PlayerSave, SaveSlotMeta } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';

function validateSaveId(id: string): void {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid save id');
}

const DEFER_MS = 500;

export class SaveManager {
  private readonly cache = new Map<string, PlayerSave>();
  private readonly pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly tails = new Map<string, Promise<void>>();
  /** Fired after the atomic disk write — used to mirror the persisted version. */
  private afterPersist: ((save: PlayerSave) => void) | null = null;
  private afterDelete: ((saveId: string) => void) | null = null;
  private remoteLoad: ((id: string) => Promise<PlayerSave | null>) | null = null;

  private primary = false;
  private dirty = new Map<string, PlayerSave | null>();

  /** In primary mode disk files are migration inputs, never runtime fallbacks. */
  usePrimary(records: PlayerSave[]): void {
    this.flushAll();
    this.primary = true;
    this.cache.clear();
    for (const record of records) this.cache.set(record.id, structuredClone(this.normalize ? this.normalize(record) : record));
  }

  takePending(): Array<{ id: string; save: PlayerSave | null }> {
    const batch = [...this.dirty].map(([id, save]) => ({ id, save: save ? structuredClone(save) : null }));
    this.dirty.clear();
    return batch;
  }

  constructor(
    private readonly dir: string,
    private readonly normalize?: (save: PlayerSave) => PlayerSave,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  setPersistHooks(hooks: {
    afterPersist?: (save: PlayerSave) => void;
    afterDelete?: (saveId: string) => void;
  }): void {
    this.afterPersist = hooks.afterPersist ?? null;
    this.afterDelete = hooks.afterDelete ?? null;
  }

  /** Postgres (or other) fallback when the local JSON file is missing. */
  setRemoteLoader(loader: ((id: string) => Promise<PlayerSave | null>) | null): void {
    this.remoteLoad = loader;
  }

  /** True if a JSON file exists on disk (ignores memory cache). */
  hasLocalFile(id: string): boolean {
    validateSaveId(id);
    return existsSync(join(this.dir, `${id}.json`));
  }

  /** Migration is all-or-nothing: never mark a skipped corrupt JSON as imported. */
  listForMigration():PlayerSave[] {
    const records:PlayerSave[]=[];
    for(const name of readdirSync(this.dir).filter(name=>name.endsWith('.json'))){
      const id=name.slice(0,-5);validateSaveId(id);
      if(existsSync(join(this.dir,`${id}.deleted`)))continue;
      const save=this.load(id);
      if(!save)throw new Error(`Invalid legacy save: ${id}; repair it before migration`);
      records.push(save);
    }
    return records;
  }

  list(): SaveSlotMeta[] {
    if (this.primary) return [...this.cache.values()].map(save => ({id:save.id,name:save.name,race:save.race,profession:save.profession,level:save.level,updatedAt:save.updatedAt})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    if (!existsSync(this.dir)) return [];

    return readdirSync(this.dir)
      .filter((name: string) => name.endsWith('.json'))
      .map((name: string): SaveSlotMeta | null => {
        const save = this.load(name.replace(/\.json$/, ''));
        if (!save) return null;
        return {
          id: save.id,
          name: save.name,
          race: save.race,
          profession: save.profession,
          level: save.level,
          updatedAt: save.updatedAt,
        };
      })
      .filter((item): item is SaveSlotMeta => item !== null)
      .sort((a: SaveSlotMeta, b: SaveSlotMeta) => b.updatedAt.localeCompare(a.updatedAt));
  }

  load(id: string): PlayerSave | null {
    validateSaveId(id);
    const cached = this.cache.get(id);
    if (cached) return structuredClone(cached);
    if (this.primary) return null;

    if (existsSync(join(this.dir,`${id}.deleted`))) return null;
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    let raw: PlayerSave;
    try {
      const text = readFileSync(path, 'utf8').trim();
      if (!text) return null;
      raw = JSON.parse(text) as PlayerSave;
    } catch {
      console.warn(`[save] corrupt or unreadable save file: ${id}`);
      return null;
    }
    if(!raw||typeof raw!=='object'||raw.id!==id){console.warn(`[save] mismatched save identity: ${id}`);return null;}
    if (!this.normalize) {
      this.cache.set(id, raw);
      return structuredClone(raw);
    }
    const normalized = this.normalize(raw);
    const needsMigration =
      !raw.profession ||
      !raw.skillLevels ||
      Object.keys(raw.skillLevels ?? {}).length === 0 ||
      raw.inventory === undefined ||
      raw.equipment === undefined ||
      raw.skillHotbar === undefined ||
      JSON.stringify(raw.skillLevels ?? {}) !== JSON.stringify(normalized.skillLevels);
    this.cache.set(id, normalized);
    if (needsMigration) {
      this.writeDisk(normalized);
    }
    return structuredClone(normalized);
  }

  /**
   * File/cache first; on miss, optional remote loader (Postgres) then hydrate to disk.
   */
  async loadAsync(id: string): Promise<PlayerSave | null> {
    const local = this.load(id);
    if (this.primary) return local;
    if (local) return local;
    if (existsSync(join(this.dir,`${id}.deleted`))) return null;
    if (!this.remoteLoad) return null;
    let remote: PlayerSave | null;
    try {
      remote = await this.remoteLoad(id);
    } catch {
      return null;
    }
    if (existsSync(join(this.dir,`${id}.deleted`))) return null;
    const current = this.load(id);
    if (current) return current;
    if (!remote) return null;
    const normalized = this.normalize ? this.normalize(remote) : remote;
    // Hydrate local primary without waiting for deferred write.
    return this.save(normalized, { sync: true });
  }

  /** Ephemeral movement/vitals; progression commands still call save() and commit durably. */
  updateRuntime(data:PlayerSave):PlayerSave {
    validateSaveId(data.id);
    const current=this.cache.get(data.id);if(!current)throw new Error('Save not loaded');
    const next={...data,revision:current.revision,updatedAt:current.updatedAt};
    this.cache.set(data.id,structuredClone(next));
    if(this.primary&&this.dirty.has(data.id))this.dirty.set(data.id,structuredClone(next));
    return next;
  }

  /** Synchronous domain command: read fresh state and complete before yielding the event loop. */
  command<T>(id: string, fn: (save: PlayerSave) => T): T {
    const save = this.load(id);
    if (!save) throw new Error('Save not found');
    const result = fn(save);
    if (result instanceof Promise) throw new Error('Save commands must be synchronous');
    return result;
  }

  /**
   * Serialize load-mutate-save for one character across awaits (combat vs position vs PATCH).
   */
  async exclusive<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = this.tails.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => gate);
    this.tails.set(id, tail);
    try {
      await prev;
      return await fn();
    } finally {
      release();
      if (this.tails.get(id) === tail) this.tails.delete(id);
    }
  }

  /**
   * По умолчанию пишет на диск с задержкой (не блокирует combat tick).
   * `sync: true` — сразу на диск (travel / create / delete / claim).
   */
  save(data: PlayerSave, opts?: { sync?: boolean }): PlayerSave {
    validateSaveId(data.id);
    if (!this.primary && existsSync(join(this.dir,`${data.id}.deleted`))) throw new Error('Save was deleted');
    const now = new Date().toISOString();
    const next: PlayerSave = {
      ...data,
      updatedAt: now,
      revision: Math.max(this.cache.get(data.id)?.revision ?? 0, data.revision ?? 0) + 1,
    };
    this.cache.set(next.id, structuredClone(next));
    if (this.primary) {
      this.dirty.set(next.id, structuredClone(next));
    } else if (opts?.sync) {
      this.clearPending(next.id);
      this.writeDisk(next);
    } else {
      this.scheduleWrite(next.id);
    }
    return next;
  }

  /** Сбросить все отложенные записи на диск (shutdown). */
  flushAll(): void {
    for (const id of this.pendingWrites.keys()) {
      this.clearPending(id);
      const data = this.cache.get(id);
      if (data) this.writeDisk(data);
    }
  }

  listByIds(ids: string[]): SaveSlotMeta[] {
    const set = new Set(ids);
    return this.list().filter((slot) => set.has(slot.id));
  }

  /** Saves without accountId — leftover from pre-auth era. */
  listOrphans(): SaveSlotMeta[] {
    return this.list().filter((slot) => {
      const save = this.load(slot.id);
      return Boolean(save && !save.accountId);
    });
  }

  listDeletedIds(): string[] {
    return readdirSync(this.dir).filter(name=>name.endsWith('.deleted')).map(name=>name.slice(0,-8));
  }

  delete(id: string): boolean {
    validateSaveId(id);
    const present=this.cache.has(id) || (!this.primary && this.hasLocalFile(id));
    if (this.primary) {
      if (!present) return false;
      this.cache.delete(id);
      this.dirty.set(id, null);
      return true;
    }
    if (!present) return false;
    writeFileSync(join(this.dir,`${id}.deleted`),new Date().toISOString(),'utf8');
    this.clearPending(id);
    this.cache.delete(id);
    const path = join(this.dir, `${id}.json`);
    if (existsSync(path)) unlinkSync(path);
    try {
      this.afterDelete?.(id);
    } catch {
      /* ignore */
    }
    return true;
  }

  create(input: {
    name: string;
    race: string;
    gender?: 'male' | 'female';
    profession?: string;
    location?: string;
    skillLevels?: Record<string, number>;
    accountId?: string;
  }): PlayerSave {
    const now = new Date().toISOString();
    const profession = input.profession ?? 'warrior';
    const save: PlayerSave = {
      id: randomUUID(),
      accountId: input.accountId,
      name: input.name,
      race: input.race,
      gender: input.gender === 'female' ? 'female' : 'male',
      profession,
      level: 1,
      xp: 0,
      hp: 100,
      maxHp: 100,
      location: input.location ?? 'starter_grove',
      adena: 100,
      inventory: ['rusty_sword'],
      equipment: {
        ...EMPTY_EQUIPMENT,
        weapon: 'rusty_sword',
      },
      skillLevels: input.skillLevels ?? {},
      skillCooldowns: {},
      questFlags: {},
      radio: { powerOn: false, sessionExpiresAt: null, frequencies: [] },
      createdAt: now,
      updatedAt: now,
    };
    return this.save(save, { sync: true });
  }

  private scheduleWrite(id: string): void {
    this.clearPending(id);
    const timer = setTimeout(() => {
      this.pendingWrites.delete(id);
      const data = this.cache.get(id);
      if (data) this.writeDisk(data);
    }, DEFER_MS);
    // Не держим процесс живым только из‑за отложенного сейва
    timer.unref?.();
    this.pendingWrites.set(id, timer);
  }

  private clearPending(id: string): void {
    const t = this.pendingWrites.get(id);
    if (t) {
      clearTimeout(t);
      this.pendingWrites.delete(id);
    }
  }

  private writeDisk(data: PlayerSave): void {
    const path = join(this.dir, `${data.id}.json`);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(tmp, path);
    try {
      this.afterPersist?.(data);
    } catch {
      /* mirror must never break gameplay saves */
    }
  }
}
