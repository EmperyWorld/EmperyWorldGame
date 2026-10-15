import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServicesConfig } from '@empery/shared/config';
import { ComfyUIClient, FileMediaJobStore } from '@empery/media';

const config = loadServicesConfig();
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const outputDir = join(rootDir, config.comfyui.outputDir);
const jobsDir = join(rootDir, config.comfyui.jobsDir);

mkdirSync(outputDir, { recursive: true });
mkdirSync(jobsDir, { recursive: true });

const comfy = new ComfyUIClient(config.comfyui.url, {
  ...config.comfyui,
  outputDir,
  jobsDir,
});
const jobs = new FileMediaJobStore(jobsDir);

console.log('[worker] Empery media worker started');
console.log(`[worker] ComfyUI: ${config.comfyui.url}`);
console.log(`[worker] Output: ${outputDir}`);
console.log(`[worker] Poll interval: ${config.worker.pollIntervalMs}ms`);

let stopping = false;
process.once('SIGINT',()=>{stopping=true;});
process.once('SIGTERM',()=>{stopping=true;});

async function tick(): Promise<void> {
  jobs.recoverAbandoned();
  const health = await comfy.healthCheck();
  if (!health.ok) { console.warn('[worker] ComfyUI unavailable:',health.detail); return; }
  for (const pending of jobs.list().filter(job=>job.status==='pending')) {
    if (stopping) break;
    const claim = jobs.claim(pending.id);
    if (!claim?.job.request) continue;
    try {
      const result=await comfy.runJob(claim.job,claim.job.request,promptId=>jobs.checkpoint(claim,{promptId}));
      jobs.finish(claim,{status:'done',url:result.url});
    } catch (error) {
      jobs.finish(claim,{status:'failed',error:error instanceof Error?error.message:'unknown error'});
    }
  }
}

// Await the complete pass before polling again; a stale pending list cannot overlap itself.
while (!stopping) {
  try {await tick();} catch (error) {console.error('[worker] tick failed',error);}
  if (!stopping) await new Promise<void>(resolve=>setTimeout(resolve,config.worker.pollIntervalMs));
}
