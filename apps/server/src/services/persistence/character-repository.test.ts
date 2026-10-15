import { describe, expect, it, vi } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import type { Pool } from 'pg';
import { PostgresCharacterRepository } from './character-repository.js';

describe('PostgresCharacterRepository', () => {
  it('uses save updatedAt as a monotonic upsert guard', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [],rowCount:1 };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
    } as unknown as Pool;
    const repository = new PostgresCharacterRepository(pool);
    const updatedAt = '2026-09-17T00:00:00.000Z';
    const save: PlayerSave = {
      id: 'save-1',
      accountId: 'account-1',
      name: 'Hero',
      race: 'human',
      gender: 'male',
      profession: 'warrior',
      level: 2,
      xp: 10,
      hp: 100,
      maxHp: 100,
      location: 'empery_haven',
      inventory: [],
      equipment: {},
      skillLevels: {},
      skillCooldowns: {},
      questFlags: {},
      createdAt: updatedAt,
      updatedAt,
    };

    await repository.saveCharacter(save);

    const upsert = queries.find((entry) => entry.sql.includes('INSERT INTO characters'));
    expect(upsert?.sql).toContain("characters.payload_json->>'revision'");
    expect(upsert?.sql).toContain('characters.updated_at < EXCLUDED.updated_at');
    expect(upsert?.params?.[13]).toBe(updatedAt);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('does not rewrite child tables when the parent rejects a stale version', async () => {
    const queries:string[]=[];
    const client={query:vi.fn(async(sql:string)=>{queries.push(sql);return {rows:[],rowCount:sql.includes('INSERT INTO characters')?0:1};}),release:vi.fn()};
    const repository=new PostgresCharacterRepository({connect:async()=>client} as unknown as Pool);
    await repository.saveCharacter({id:'stale',equipment:{weapon:'old'},skillLevels:{old:1},inventory:['old'],updatedAt:'2020-01-01T00:00:00Z'} as unknown as PlayerSave);
    expect(queries.some(sql=>sql.startsWith('DELETE FROM'))).toBe(false);
    expect(queries.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
