import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { FileMediaJobStore } from './comfyui-client.js';

describe('local media claims',()=>{
  it('claims each pending job once across workers and never reclaims a live generation',()=>{
    const dir=mkdtempSync(join(tmpdir(),'empery-jobs-'));
    try {
      writeFileSync(join(dir,'job1.json'),JSON.stringify({id:'job1',status:'pending',profile:'icon',request:{profile:'icon'}}));
      const first=new FileMediaJobStore(dir),second=new FileMediaJobStore(dir);
      const claim=first.claim('job1');expect(claim).not.toBeNull();
      expect(second.claim('job1')).toBeNull();second.recoverAbandoned();
      expect(second.claim('job1')).toBeNull();
      first.checkpoint(claim!,{promptId:'comfy-queued'});
      expect(second.get('job1')?.promptId).toBe('comfy-queued');
      first.finish(claim!,{status:'done',url:'/media/job1.webp'});
      expect(second.claim('job1')).toBeNull();expect(second.get('job1')?.status).toBe('done');
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it('recovers a dead owner, preserves prompt id and rejects stale completion',()=>{
    const dir=mkdtempSync(join(tmpdir(),'empery-jobs-'));
    try {
      writeFileSync(join(dir,'job1.json'),JSON.stringify({id:'job1',status:'pending',profile:'icon'}));
      const store=new FileMediaJobStore(dir),old=store.claim('job1')!;
      store.checkpoint(old,{promptId:'already-queued',workerHost:hostname()});
      const running=readdirSync(dir).find(name=>name.includes('.running.'))!;
      renameSync(join(dir,running),join(dir,'job1.running.2147483647-dead.json'));
      store.recoverAbandoned();
      expect(store.get('job1')?.status).toBe('pending');
      const next=store.claim('job1')!;expect(next.job.promptId).toBe('already-queued');
      expect(()=>store.finish(old,{status:'done'})).toThrow('Media claim lost');
      store.finish(next,{status:'done'});expect(store.get('job1')?.status).toBe('done');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
});
