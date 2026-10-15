#!/usr/bin/env tsx
/**
 * Пакетная генерация всех игровых ассетов через ComfyUI.
 * Usage: pnpm generate:media [--force] [--only=prefix]
 *
 * ComfyUI отдаёт PNG → post-process → WebP в data/generated/assets/{id}.webp
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServicesConfig } from '@empery/shared/config';
import {
  ComfyUIClient,
  MEDIA_CATALOG,
  assetUrl,
  ASSET_IMAGE_EXT,
  isMediaCategoryId,
  profileInMediaCategory,
} from '@empery/media';
import { packMediaAtlases } from './pack-media-atlases.ts';

const force = process.argv.includes('--force');
const skipAtlas = process.argv.includes('--skip-atlas');
const onlyPrefix = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const categoryArg = process.argv.find((a) => a.startsWith('--category='))?.slice('--category='.length);
const styleBias = process.argv.find((a) => a.startsWith('--style='))?.slice('--style='.length).trim();
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadServicesConfig();
const outputDir = join(rootDir, config.comfyui.outputDir);
const assetsDir = join(outputDir, 'assets');
mkdirSync(assetsDir, { recursive: true });
const generationLockPath = join(outputDir, '.generate-media.lock');

function processIsRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function acquireGenerationLock(): () => void {
  if (existsSync(generationLockPath)) {
    const ownerPid = Number.parseInt(readFileSync(generationLockPath, 'utf8'), 10);
    if (processIsRunning(ownerPid)) {
      throw new Error(`Media generation is already running (PID ${ownerPid})`);
    }
    unlinkSync(generationLockPath);
  }
  const fd = openSync(generationLockPath, 'wx');
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  return () => {
    try {
      const ownerPid = Number.parseInt(readFileSync(generationLockPath, 'utf8'), 10);
      if (ownerPid === process.pid) unlinkSync(generationLockPath);
    } catch {
      // Already removed or replaced.
    }
  };
}

const comfy = new ComfyUIClient(config.comfyui.url, {
  ...config.comfyui,
  outputDir,
  jobsDir: join(rootDir, config.comfyui.jobsDir),
});

type ManifestEntry = {url:string;profile:string;label:string};
/** Publish completed assets atomically, preserving atlas metadata and other generators' entries. */
function mergeManifestEntries(entries: Record<string,ManifestEntry>): void {
  const path=join(rootDir,'content/media/manifest.json');
  const current=existsSync(path)?JSON.parse(readFileSync(path,'utf8')) as {assets?:Record<string,ManifestEntry>;[key:string]:unknown}:{};
  const next={...current,generatedAt:new Date().toISOString(),assets:{...current.assets,...entries}};
  mkdirSync(dirname(path),{recursive:true});
  const temporary=`${path}.tmp-${process.pid}`;
  try {writeFileSync(temporary,JSON.stringify(next,null,2));renameSync(temporary,path);}
  finally {if(existsSync(temporary))unlinkSync(temporary);}
}

async function main(): Promise<void> {
  const releaseLock = acquireGenerationLock();
  try {
    const health = await comfy.healthCheck();
    if (!health.ok) {
      console.error('ComfyUI недоступен:', health.detail);
      process.exitCode = 1;
      return;
    }

  if (categoryArg && !isMediaCategoryId(categoryArg)) {
    console.error(`Неизвестная категория "${categoryArg}"`);
    process.exit(1);
  }

  const category = categoryArg && isMediaCategoryId(categoryArg) ? categoryArg : 'all';
  const exactOnly = Boolean(onlyPrefix && MEDIA_CATALOG.some((spec) => spec.id === onlyPrefix));
  const catalog = MEDIA_CATALOG.filter(
    (spec) =>
      profileInMediaCategory(spec.profile, category) &&
      (!onlyPrefix || (exactOnly ? spec.id === onlyPrefix : spec.id.startsWith(onlyPrefix))),
  );

  if (catalog.length === 0) {
    console.error(`Нет ассетов с префиксом "${onlyPrefix}"`);
    process.exit(1);
  }

  console.log(`ComfyUI OK — генерируем ${catalog.length} ассетов...`);
  console.log(`Выход: ${assetsDir} (.${ASSET_IMAGE_EXT})\n`);

  const manifest: Record<string, { url: string; profile: string; label: string }> = {};
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const spec of catalog) {
    const localPath = join(assetsDir, `${spec.id}.${ASSET_IMAGE_EXT}`);

    if (!force && existsSync(localPath)) {
      console.log(`[skip] ${spec.id} — уже есть`);
      manifest[spec.id] = { url: assetUrl(spec.id), profile: spec.profile, label: spec.label };
      skipped++;
      continue;
    }

    process.stdout.write(`[gen]  ${spec.id} (${spec.label})... `);
    try {
      const params = {
        ...spec.params,
        ...(styleBias ? { style_bias: styleBias } : {}),
        // A forced rebuild must retain the explicit seed of a permanent character.
        ...(force && spec.params.seed == null ? { seed: String(Math.floor(Math.random() * 2_000_000_000)) } : {}),
      };
      const result = await comfy.generateAsset(spec.id, {
        profile: spec.profile,
        params,
      });
      manifest[spec.id] = { url: result.url, profile: spec.profile, label: spec.label };
      mergeManifestEntries(manifest);
      done++;
      console.log('OK');
    } catch (err) {
      failed++;
      console.log('FAIL');
      console.error('       ', err instanceof Error ? err.message : err);
    }
  }

  mergeManifestEntries(manifest);

  console.log(`\nГотово: ${done} сгенерировано, ${skipped} пропущено, ${failed} ошибок`);
  console.log(`Manifest: content/media/manifest.json`);
  if (failed > 0) process.exitCode = 1;
    if (!skipAtlas) await packMediaAtlases();
  } finally {
    releaseLock();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
