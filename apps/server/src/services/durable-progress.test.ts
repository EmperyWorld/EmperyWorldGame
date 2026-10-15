import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveManager } from '@empery/save';
import { RuntimeMetrics } from './runtime-metrics.js';
import { DurableProgress } from './durable-progress.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const roots:string[]=[];const monitors:RuntimeMetrics[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});for(const m of monitors.splice(0))m.close();});
function fixture(commit=vi.fn(async()=>{})){
 const root=mkdtempSync(join(tmpdir(),'durable-progress-'));roots.push(root);
 const saves=new SaveManager(root);saves.usePrimary([]);const metrics=new RuntimeMetrics();monitors.push(metrics);
 const progress=new DurableProgress(saves,commit,metrics);
 return {saves,progress,commit};
}
describe('durable progress acknowledgements',()=>{
 it('waits for a commit, serializes batches and includes the receipt in the same commit',async()=>{
   let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
   const commit=vi.fn(async()=>{await gate;});const f=fixture(commit);
   const created=f.saves.create({name:'Hero',race:'human'});const receipt={accountId:'account',key:'key',fingerprint:'hash',result:{ok:true}};
   let acknowledged=false;const first=f.progress.flush(receipt).then(()=>{acknowledged=true;});
   await Promise.resolve();expect(acknowledged).toBe(false);
   f.saves.save({...created,adena:999});const second=f.progress.flush();expect(commit).toHaveBeenCalledTimes(1);
   release();await Promise.all([first,second]);expect(commit).toHaveBeenCalledTimes(2);
   expect(commit.mock.calls[0]).toEqual([[{id:created.id,save:created}],receipt]);
 });
 it('fails closed after a rejected database commit',async()=>{
   const f=fixture(vi.fn(async()=>{throw new Error('database down');}));f.saves.create({name:'Hero',race:'human'});
   await expect(f.progress.flush()).rejects.toMatchObject({statusCode:503});
   expect(f.progress.healthy()).toBe(false);expect(()=>f.progress.flush()).toThrow();expect(f.commit).toHaveBeenCalledTimes(1);
 });
});
