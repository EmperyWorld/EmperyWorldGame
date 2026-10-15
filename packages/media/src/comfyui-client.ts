import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import type { HealthStatus, MediaJobRequest, MediaJobStatus, ServicesConfig } from '@empery/shared';
import { buildWorkflowForJob } from './workflow-builder.js';
import { postProcessGameSprite, postProcessAsset } from './asset-postprocess.js';
import { ASSET_IMAGE_EXT, encodeToWebp } from './webp-encode.js';

export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

export class ComfyUIClient {
  constructor(
    private readonly baseUrl: string,
    private readonly mediaCfg: ServicesConfig['comfyui'],
  ) {}

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      return {
        service: 'comfyui',
        ok: res.ok,
        latencyMs: Date.now() - started,
        detail: res.ok ? 'ok' : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        service: 'comfyui',
        ok: false,
        latencyMs: Date.now() - started,
        detail: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  createJob(request: MediaJobRequest): MediaJobStatus {
    return {
      id: randomUUID(),
      status: 'pending',
      profile: request.profile,
    };
  }

  async runJob(job: MediaJobStatus & {promptId?:string}, request: MediaJobRequest, onQueued?: (promptId:string)=>void): Promise<{ localPath: string; url: string }> {
    const workflow = buildWorkflowForJob(this.mediaCfg, request, job.id);

    let promptId = job.promptId;
    if (!promptId) {
      const clientId = randomUUID();
      const queueRes = await fetch(`${this.baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!queueRes.ok) {
        throw new Error(`ComfyUI queue failed: HTTP ${queueRes.status}`);
      }

      const queueData = (await queueRes.json()) as { prompt_id?: string; error?: string };
      if (!queueData.prompt_id) {
        throw new Error(queueData.error ?? 'ComfyUI returned no prompt_id');
      }

      promptId = queueData.prompt_id;
      onQueued?.(promptId);
    }
    const image = await this.waitForImage(promptId);
    const rawBytes = await this.downloadImage(image);
    const bytes = await encodeToWebp(rawBytes);
    mkdirSync(this.mediaCfg.outputDir, { recursive: true });

    const localPath = join(this.mediaCfg.outputDir, `${job.id}.${ASSET_IMAGE_EXT}`);
    writeFileSync(localPath, bytes);

    return { localPath, url: `/media/${job.id}.${ASSET_IMAGE_EXT}` };
  }

  /** Генерация с фиксированным id → data/generated/assets/{assetId}.webp */
  async generateAsset(
    assetId: string,
    request: MediaJobRequest,
  ): Promise<{ localPath: string; url: string }> {
    const assetsDir = join(this.mediaCfg.outputDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });

    const workflow = buildWorkflowForJob(this.mediaCfg, request, assetId);

    const clientId = randomUUID();
    const queueRes = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!queueRes.ok) {
      throw new Error(`ComfyUI queue failed: HTTP ${queueRes.status}`);
    }

    const queueData = (await queueRes.json()) as { prompt_id?: string; error?: string };
    if (!queueData.prompt_id) {
      throw new Error(queueData.error ?? 'ComfyUI returned no prompt_id');
    }

    const image = await this.waitForImage(queueData.prompt_id);
    const rawBytes = await this.downloadImage(image);
    const pngBytes = this.finalizeAssetBytes(rawBytes, request);
    const bytes = await encodeToWebp(pngBytes);
    const localPath = join(assetsDir, `${assetId}.${ASSET_IMAGE_EXT}`);
    writeFileSync(localPath, bytes);

    return { localPath, url: `/media/assets/${assetId}.${ASSET_IMAGE_EXT}` };
  }

  private finalizeAssetBytes(raw: Buffer, request: MediaJobRequest): Buffer {
    if (request.profile === 'game_sprite') {
      return postProcessGameSprite(raw, request.params);
    }
    if (
      request.profile === 'tileset' ||
      request.profile === 'terrain_tile' ||
      request.profile === 'prop_sprite' ||
      request.profile === 'ship_sprite' ||
      request.profile === 'item_icon' ||
      request.profile === 'skill_icon' ||
      request.profile === 'character_sheet' ||
      request.profile === 'portrait_npc' ||
      request.profile === 'dialogue_portrait' ||
      request.profile === 'location_bg'
    ) {
      return postProcessAsset(raw, request.profile);
    }
    return raw;
  }

  private async waitForImage(promptId: string, timeoutMs = 300_000): Promise<ComfyImageRef> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const res = await fetch(`${this.baseUrl}/history/${promptId}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`ComfyUI history HTTP ${res.status}`);

      const history = (await res.json()) as Record<
        string,
        { outputs?: Record<string, { images?: ComfyImageRef[] }> }
      >;

      const entry = history[promptId];
      if (entry?.outputs) {
        for (const output of Object.values(entry.outputs)) {
          const img = output.images?.[0];
          if (img) return img;
        }
      }

      await sleep(2000);
    }
    throw new Error('ComfyUI generation timed out');
  }

  private async downloadImage(image: ComfyImageRef): Promise<Buffer> {
    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
    });
    const res = await fetch(`${this.baseUrl}/view?${params}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`ComfyUI view HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(request: MediaJobRequest): string {
  return createHash('sha256')
    .update(JSON.stringify({ profile: request.profile, params: request.params }))
    .digest('hex');
}

export interface StoredMediaJob extends MediaJobStatus {
  request?: MediaJobRequest;
  cacheKey?: string;
  promptId?: string;
  workerPid?: number;
  workerHost?: string;
  ownerAccountId?: string;
}
export interface MediaJobClaim { token: string; job: StoredMediaJob; }

/** Atomic rename claims on a local filesystem; concurrent workers on this host are supported. */
export class FileMediaJobStore {
  constructor(private readonly jobsDir: string) { mkdirSync(jobsDir, { recursive: true }); }
  private jobPath(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid job id');
    return join(this.jobsDir, `${id}.json`);
  }
  private runningPath(id:string,token:string):string { return join(this.jobsDir, `${id}.running.${token}.json`); }
  private write(path:string,job:StoredMediaJob):void {
    const tmp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(tmp,JSON.stringify(job,null,2));
    renameSync(tmp,path);
  }
  create(client: ComfyUIClient, request: MediaJobRequest, ownerAccountId?: string): MediaJobStatus {
    const key = ownerAccountId ? createHash('sha256').update(`${cacheKey(request)}:${ownerAccountId}`).digest('hex') : cacheKey(request);
    const existing = this.list().find(job=>job.cacheKey===key && job.status==='done' && job.url);
    if (existing) return existing;
    const job = client.createJob(request);
    this.write(this.jobPath(job.id), {...job,request,cacheKey:key,ownerAccountId});
    return job;
  }
  get(id:string):StoredMediaJob | undefined {
    const base=this.jobPath(id);
    const path = existsSync(base) ? base : readdirSync(this.jobsDir).filter(name=>name.startsWith(`${id}.running.`) && name.endsWith('.json')).map(name=>join(this.jobsDir,name))[0];
    if (!path) return undefined;
    try { return JSON.parse(readFileSync(path,'utf8')) as StoredMediaJob; }
    catch (error) { if (!existsSync(path)) return undefined; throw error; }
  }
  update(id:string,patch:Partial<StoredMediaJob>):StoredMediaJob | undefined {
    const current=this.get(id);
    if (!current || current.status==='running') return undefined;
    const next={...current,...patch}; this.write(this.jobPath(id),next); return next;
  }
  list():StoredMediaJob[] {
    return readdirSync(this.jobsDir).filter(name=>name.endsWith('.json')).flatMap(name=>{
      try { return [JSON.parse(readFileSync(join(this.jobsDir,name),'utf8')) as StoredMediaJob]; }
      catch (error) { if (!existsSync(join(this.jobsDir,name))) return []; throw error; }
    });
  }
  claim(id:string):MediaJobClaim | null {
    const base=this.jobPath(id);
    const token=`${process.pid}-${randomUUID()}`; const path=this.runningPath(id,token);
    if (!existsSync(base)) return null;
    const candidate=JSON.parse(readFileSync(base,'utf8')) as StoredMediaJob;
    if (candidate.status!=='pending') return null;
    try { renameSync(base,path); } catch (error) { if (!existsSync(base)) return null; throw error; }
    // Re-read the file we actually claimed: another process may have completed it
    // between our initial read and rename. Never execute the stale candidate snapshot.
    const current=JSON.parse(readFileSync(path,'utf8')) as StoredMediaJob;
    if (current.status!=='pending') { renameSync(path,base); return null; }
    const job={...current,status:'running' as const,workerPid:process.pid,workerHost:hostname()};
    this.write(path,job);
    return {token,job};
  }
  checkpoint(claim:MediaJobClaim,patch:Partial<StoredMediaJob>):void {
    const path=this.runningPath(claim.job.id,claim.token);
    if (!existsSync(path)) throw new Error('Media claim lost');
    claim.job={...claim.job,...patch};this.write(path,claim.job);
  }
  finish(claim:MediaJobClaim,patch:Partial<StoredMediaJob>):void {
    this.checkpoint(claim,patch);
    renameSync(this.runningPath(claim.job.id,claim.token),this.jobPath(claim.job.id));
  }
  /** Recover only dead owners, never time out a live long-running generation. */
  recoverAbandoned():void {
    for(const name of readdirSync(this.jobsDir).filter(name=>(name.includes('.running.') || name.includes('.recovering.')) && name.endsWith('.json'))){
      const path=join(this.jobsDir,name);
      let job:StoredMediaJob;
      try {job=JSON.parse(readFileSync(path,'utf8'));} catch(error){if(!existsSync(path))continue;throw error;}
      if(job.workerHost && job.workerHost!==hostname()) throw new Error('File media queue requires workers on the same host');
      const owner = Number(name.split(/\.(?:running|recovering)\./)[1]?.split('-')[0]);
      if (!Number.isInteger(owner) || owner <= 0) throw new Error('Invalid media claim owner');
      try {process.kill(owner,0);continue;}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')continue;}
      // Claim the dead owner's exact filename before changing its record. Other recoverers
      // cannot steal this recovery because its filename now carries our live PID.
      const recovering = join(this.jobsDir,`${job.id}.recovering.${process.pid}-${randomUUID()}.json`);
      try {renameSync(path,recovering);}catch(error){if(!existsSync(path))continue;throw error;}
      this.write(recovering,{...job,status:'pending',workerPid:undefined,workerHost:undefined});
      renameSync(recovering,this.jobPath(job.id));
    }
  }
}

/** @deprecated use FileMediaJobStore */
export class MediaJobStore extends FileMediaJobStore {}
