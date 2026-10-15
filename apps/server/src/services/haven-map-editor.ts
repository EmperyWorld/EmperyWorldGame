import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { havenMapWorldSize } from '@empery/shared';
import {
  havenPropsRevision,
  readGeneratedHavenProps,
  type HavenPropPlacement,
} from './haven-map-dump.js';

const execFileAsync = promisify(execFile);
const MAX_HAVEN_PROPS = 4_000;

export interface SaveHavenPropsInput {
  expectedRevision: string;
  placements: unknown;
}

export interface SaveHavenPropsResult {
  revision: string;
  count: number;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateHavenPropPlacements(value: unknown): HavenPropPlacement[] {
  if (!Array.isArray(value) || value.length > MAX_HAVEN_PROPS) {
    throw new Error(`placements must be an array with at most ${MAX_HAVEN_PROPS} rows`);
  }
  return value.map((raw, index) => {
    if (
      !Array.isArray(raw) ||
      raw.length !== 5 ||
      typeof raw[0] !== 'string' ||
      !/^prop_[a-z0-9_]+$/.test(raw[0]) ||
      !finiteNumber(raw[1]) ||
      !finiteNumber(raw[2]) ||
      !finiteNumber(raw[3]) ||
      !finiteNumber(raw[4])
    ) {
      throw new Error(`invalid prop placement at row ${index}`);
    }
    const [id, x, y, size, depth] = raw;
    const { w: mapW, h: mapH } = havenMapWorldSize();
    if (x < 0 || x > mapW || y < 0 || y > mapH) {
      throw new Error(`prop placement ${index} is outside Haven bounds`);
    }
    if (size < 16 || size > 1_024 || depth < -100 || depth > 100) {
      throw new Error(`prop placement ${index} has invalid size or depth`);
    }
    return [id, Math.round(x), Math.round(y), Math.round(size), Math.round(depth)];
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

let saveInFlight = false;

export async function saveHavenPropOverrides(
  rootDir: string,
  updatedBy: string,
  input: SaveHavenPropsInput,
): Promise<SaveHavenPropsResult> {
  if (saveInFlight) throw new Error('another Haven map save is already running');
  const current = readGeneratedHavenProps(rootDir);
  const currentRevision = havenPropsRevision(current);
  if (input.expectedRevision !== currentRevision) {
    throw new Error('Haven map changed; reload before saving');
  }
  const placements = validateHavenPropPlacements(input.placements);
  const layoutsDir = join(rootDir, 'content/layouts');
  const path = join(layoutsDir, 'empery_haven-props.override.json');
  const tempPath = `${path}.tmp`;
  const hadPrevious = await fileExists(path);
  const previous = hadPrevious ? await readFile(path, 'utf8') : null;

  saveInFlight = true;
  try {
    await mkdir(layoutsDir, { recursive: true });
    await writeFile(
      tempPath,
      `${JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          updatedBy,
          placements,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await rename(tempPath, path);
    await execFileAsync('pnpm', ['generate:maps'], {
      cwd: rootDir,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const generated = readGeneratedHavenProps(rootDir);
    return {
      revision: havenPropsRevision(generated),
      count: generated.length,
    };
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    if (previous != null) {
      await writeFile(path, previous, 'utf8');
    } else {
      await unlink(path).catch(() => undefined);
    }
    await execFileAsync('pnpm', ['generate:maps'], {
      cwd: rootDir,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    }).catch(() => undefined);
    throw error;
  } finally {
    saveInFlight = false;
  }
}
