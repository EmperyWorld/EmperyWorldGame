import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMediaCategoryId, type MediaCategoryId } from '@empery/media';

export type AdminJobKind = 'generate_items' | 'generate_media';
export type AdminJobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface AdminJob {
  id: string;
  kind: AdminJobKind;
  status: AdminJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  createdBy: string;
  args: Record<string, unknown>;
  log: string[];
  error?: string;
  result?: Record<string, unknown>;
  progress?: {
    completed: number;
    total: number;
    current?: string;
  };
}

const jobs = new Map<string, AdminJob>();
const jobProcesses = new Map<string, ChildProcess>();
const MAX_JOBS = 100;
const MAX_LOG_LINES = 200;
let storePath: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistTail: Promise<void> = Promise.resolve();

function persistedJobsJson(): string {
  return `${JSON.stringify({ version: 1, jobs: listAdminJobs(MAX_JOBS) }, null, 2)}\n`;
}

function persistJobsNow(): Promise<void> {
  if (!storePath) return Promise.resolve();
  const path = storePath;
  const tempPath = `${path}.tmp`;
  const json = persistedJobsJson();
  persistTail = persistTail
    .then(async () => {
      await writeFile(tempPath, json, 'utf8');
      await rename(tempPath, path);
    })
    .catch((error: unknown) => {
      console.warn('[admin-jobs] persistence failed', error);
    });
  return persistTail;
}

function schedulePersist(): void {
  if (!storePath) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistJobsNow();
  }, 250);
  persistTimer.unref();
}

export function configureAdminJobs(rootDir: string): void {
  const nextPath = join(rootDir, 'data/admin-jobs.json');
  if (storePath === nextPath) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  storePath = nextPath;
  jobs.clear();
  mkdirSync(join(rootDir, 'data'), { recursive: true });
  if (!existsSync(nextPath)) return;
  try {
    const parsed = JSON.parse(readFileSync(nextPath, 'utf8')) as { jobs?: AdminJob[] };
    for (const job of parsed.jobs ?? []) {
      if (!job?.id || !job.kind) continue;
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'error';
        job.error = 'Server restarted while the job was active';
        job.finishedAt = new Date().toISOString();
      }
      jobs.set(job.id, job);
    }
    trimStore();
  } catch (error) {
    console.warn('[admin-jobs] unable to load history', error);
  }
}

export async function flushAdminJobs(): Promise<void> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  await persistJobsNow();
}

function touch(job: AdminJob): void {
  job.updatedAt = new Date().toISOString();
  schedulePersist();
}

function trimStore(): void {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  while (jobs.size > MAX_JOBS && sorted.length) {
    const oldest = sorted.shift();
    if (
      oldest &&
      (oldest.status === 'done' || oldest.status === 'error' || oldest.status === 'cancelled')
    ) {
      jobs.delete(oldest.id);
    } else {
      break;
    }
  }
}

function appendLog(job: AdminJob, line: string): void {
  const text = line.replace(/\r/g, '').trimEnd();
  if (!text) return;
  for (const part of text.split('\n')) {
    if (!part.trim()) continue;
    job.log.push(part);
    const totalMatch = part.match(/генерируем\s+(\d+)\s+ассетов/);
    if (totalMatch?.[1] && job.progress) {
      job.progress.total = Number.parseInt(totalMatch[1], 10);
    }
    if ((part.startsWith('[gen]') || part.startsWith('[skip]')) && job.progress) {
      job.progress.completed = Math.min(job.progress.total, job.progress.completed + 1);
      job.progress.current = part.replace(/^\[(?:gen|skip)]\s+/, '').trim();
    }
  }
  if (job.log.length > MAX_LOG_LINES) {
    job.log = job.log.slice(-MAX_LOG_LINES);
  }
  touch(job);
}

function runPnpm(
  rootDir: string,
  scriptArgs: string[],
  job: AdminJob,
): void {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  touch(job);
  const child = spawn('pnpm', scriptArgs, {
    cwd: rootDir,
    env: process.env,
    shell: false,
    detached: process.platform !== 'win32',
  });
  jobProcesses.set(job.id, child);

  child.stdout?.on('data', (buf: Buffer) => appendLog(job, buf.toString('utf8')));
  child.stderr?.on('data', (buf: Buffer) => appendLog(job, buf.toString('utf8')));
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    job.finishedAt = new Date().toISOString();
    jobProcesses.delete(job.id);
    touch(job);
  });
  child.on('close', (code) => {
    jobProcesses.delete(job.id);
    if (job.status === 'error' || job.status === 'cancelled') return;
    if (code === 0) {
      job.status = 'done';
      job.result = { exitCode: 0 };
    } else {
      job.status = 'error';
      job.error = `exit code ${code ?? 'null'}`;
      job.result = { exitCode: code };
    }
    job.finishedAt = new Date().toISOString();
    touch(job);
  });
}

export interface GenerateItemsJobInput {
  count?: number;
  rarity?: string;
  slot?: string;
  theme?: string;
  seed?: number;
  noLlm?: boolean;
  noMedia?: boolean;
  dryRun?: boolean;
}

export function startGenerateItemsJob(
  rootDir: string,
  createdBy: string,
  input: GenerateItemsJobInput,
): AdminJob {
  const active = [...jobs.values()].find(
    (entry) =>
      entry.kind === 'generate_items' &&
      (entry.status === 'queued' || entry.status === 'running'),
  );
  if (active) {
    throw new Error(`item generation already running: ${active.id}`);
  }
  const count = Math.max(1, Math.min(50, Math.floor(Number(input.count ?? 5) || 5)));
  const args: string[] = ['generate:items', '--', `--count=${count}`, '--no-media'];
  // Media is a separate admin job; never attach Comfy in sync items job from admin.
  if (input.rarity && input.rarity !== 'auto') args.push(`--rarity=${input.rarity}`);
  if (input.slot && input.slot !== 'auto') args.push(`--slot=${input.slot}`);
  if (input.theme) args.push(`--theme=${input.theme}`);
  if (input.seed != null && Number.isFinite(input.seed)) args.push(`--seed=${Math.floor(input.seed)}`);
  if (input.noLlm) args.push('--no-llm');
  if (input.dryRun) args.push('--dry-run');

  const job: AdminJob = {
    id: randomUUID(),
    kind: 'generate_items',
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy,
    args: { ...input, count, noMedia: true },
    log: [],
  };
  jobs.set(job.id, job);
  trimStore();
  runPnpm(rootDir, args, job);
  return job;
}

export interface GenerateMediaJobInput {
  category?: string;
  only?: string;
  force?: boolean;
  styleBias?: string;
}

export interface ResolvedGenerateMediaInput {
  category: MediaCategoryId;
  only: string;
  force: boolean;
  styleBias: string;
  commandArgs: string[];
}

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code != null && (code <= 0x1f || code === 0x7f)) return true;
  }
  return false;
}

export function resolveGenerateMediaInput(
  input: GenerateMediaJobInput,
): ResolvedGenerateMediaInput {
  const only = String(input.only ?? '').trim();
  if (only && !/^[a-z0-9_-]{1,100}$/.test(only)) {
    throw new Error('only must contain lowercase asset id characters');
  }
  const rawCategory = String(input.category ?? 'all').trim();
  if (!isMediaCategoryId(rawCategory)) {
    throw new Error('unknown media category');
  }
  const category: MediaCategoryId = rawCategory;
  const styleBias = String(input.styleBias ?? '').trim();
  if (styleBias.length > 300 || hasControlCharacters(styleBias)) {
    throw new Error('style bias must be printable and at most 300 characters');
  }
  const force = Boolean(input.force);
  const commandArgs: string[] = ['generate:media', '--', `--category=${category}`];
  if (only) commandArgs.push(`--only=${only}`);
  if (styleBias) commandArgs.push(`--style=${styleBias}`);
  if (force) commandArgs.push('--force');
  return { category, only, force, styleBias, commandArgs };
}

export function startGenerateMediaJob(
  rootDir: string,
  createdBy: string,
  input: GenerateMediaJobInput,
): AdminJob {
  const resolved = resolveGenerateMediaInput(input);
  const active = [...jobs.values()].find(
    (entry) =>
      entry.kind === 'generate_media' &&
      (entry.status === 'queued' || entry.status === 'running'),
  );
  if (active) {
    throw new Error(`media generation already running: ${active.id}`);
  }

  const job: AdminJob = {
    id: randomUUID(),
    kind: 'generate_media',
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy,
    args: {
      category: resolved.category,
      only: resolved.only,
      force: resolved.force,
      styleBias: resolved.styleBias,
    },
    log: [],
    progress: { completed: 0, total: 0 },
  };
  jobs.set(job.id, job);
  trimStore();
  runPnpm(rootDir, resolved.commandArgs, job);
  return job;
}

export function getAdminJob(id: string): AdminJob | undefined {
  return jobs.get(id);
}

export function getLatestAdminJob(kind: AdminJobKind): AdminJob | undefined {
  let latest: AdminJob | undefined;
  for (const job of jobs.values()) {
    if (job.kind !== kind) continue;
    if (!latest || job.createdAt > latest.createdAt) latest = job;
  }
  return latest;
}

export function listAdminJobs(limit = 50): AdminJob[] {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return [...jobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, boundedLimit);
}

function terminateJobProcess(child: ChildProcess): void {
  if (child.pid == null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

export function cancelAdminJob(id: string, cancelledBy: string): AdminJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status !== 'queued' && job.status !== 'running') return job;
  job.status = 'cancelled';
  job.error = `Cancelled by ${cancelledBy}`;
  job.finishedAt = new Date().toISOString();
  appendLog(job, `[admin] cancelled by ${cancelledBy}`);
  const child = jobProcesses.get(id);
  if (child) terminateJobProcess(child);
  touch(job);
  return job;
}

/** Test helper: clear in-memory jobs. */
export function clearAdminJobsForTests(): void {
  for (const child of jobProcesses.values()) terminateJobProcess(child);
  jobProcesses.clear();
  jobs.clear();
}
