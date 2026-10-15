import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SaveManager } from './save-manager.js';

const dirs: string[] = [];

function manager(): SaveManager {
  const dir = mkdtempSync(join(tmpdir(), 'empery-save-'));
  dirs.push(dir);
  return new SaveManager(dir);
}

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('SaveManager', () => {
  it('does not alias cache through load()', () => {
    const saves = manager();
    const created = saves.create({ name: 'Hero', race: 'human' });
    const loaded = saves.load(created.id)!;
    loaded.hp = 1;
    loaded.questFlags.hacked = true;
    expect(saves.load(created.id)!.hp).toBe(100);
    expect(saves.load(created.id)!.questFlags.hacked).toBeUndefined();
  });

  it('serializes exclusive sections so the second write sees the first', async () => {
    const saves = manager();
    const created = saves.create({ name: 'Hero', race: 'human' });
    const first = saves.exclusive(created.id, async () => {
      await new Promise((r) => setTimeout(r, 25));
      const cur = saves.load(created.id)!;
      saves.save({ ...cur, hp: 50 });
    });
    const second = saves.exclusive(created.id, () => {
      const cur = saves.load(created.id)!;
      expect(cur.hp).toBe(50);
      saves.save({ ...cur, hp: 40 });
    });
    await Promise.all([first, second]);
    expect(saves.load(created.id)!.hp).toBe(40);
  });
  it('assigns increasing revisions even when time does not advance',()=>{
    const saves=manager(),first=saves.create({name:'Hero',race:'human'});
    const second=saves.save(first),third=saves.save(first);
    expect(second.revision).toBe(first.revision!+1);expect(third.revision).toBe(second.revision!+1);
  });
  it('never hydrates an in-flight remote read after deletion, including after restart',async()=>{
    const saves=manager();const created=saves.create({name:'Hero',race:'human'});
    expect(saves.delete(created.id)).toBe(true);
    saves.setRemoteLoader(async()=>created);
    expect(await saves.loadAsync(created.id)).toBeNull();
    expect(()=>saves.save(created)).toThrow('Save was deleted');
  });
  it('rejects unsafe ids before touching storage',()=>{
    const saves=manager();expect(()=>saves.load('../accounts')).toThrow('Invalid save id');expect(()=>saves.delete('../accounts')).toThrow('Invalid save id');
  });
  it('keeps file backups out of primary reads and checkpoints runtime state explicitly',()=>{
    const saves=manager(),legacy=saves.create({name:'Legacy',race:'human'});
    const dir=dirs.at(-1)!;const before=readFileSync(join(dir,`${legacy.id}.json`),'utf8');
    saves.usePrimary([legacy]);const next=saves.updateRuntime({...legacy,worldX:120});
    expect(next.revision).toBe(legacy.revision);expect(saves.takePending()).toEqual([]);
    saves.save(next);expect(saves.takePending()[0]?.save?.worldX).toBe(120);
    expect(readFileSync(join(dir,`${legacy.id}.json`),'utf8')).toBe(before);
    saves.delete(legacy.id);saves.takePending();expect(saves.load(legacy.id)).toBeNull();expect(saves.list()).toEqual([]);
  });
  it('blocks migration rather than skipping corrupt or mismatched file identities',()=>{
    const saves=manager(),dir=dirs.at(-1)!;
    writeFileSync(join(dir,'broken.json'),'{');expect(()=>saves.listForMigration()).toThrow('Invalid legacy save');
    writeFileSync(join(dir,'broken.json'),JSON.stringify({id:'different'}));expect(()=>saves.listForMigration()).toThrow('Invalid legacy save');
  });
});
