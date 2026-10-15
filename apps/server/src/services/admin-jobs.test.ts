import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearAdminJobsForTests,
  configureAdminJobs,
  listAdminJobs,
  resolveGenerateMediaInput,
} from './admin-jobs.js';

const tempDirs: string[] = [];

afterEach(() => {
  clearAdminJobsForTests();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveGenerateMediaInput', () => {
  it('builds a category regeneration with a style bias', () => {
    expect(
      resolveGenerateMediaInput({
        category: 'props',
        force: true,
        styleBias: 'weathered northern gothic stonework',
      }),
    ).toEqual({
      category: 'props',
      only: '',
      force: true,
      styleBias: 'weathered northern gothic stonework',
      commandArgs: [
        'generate:media',
        '--',
        '--category=props',
        '--style=weathered northern gothic stonework',
        '--force',
      ],
    });
  });

  it('allows generating all missing media without force', () => {
    expect(resolveGenerateMediaInput({})).toMatchObject({
      category: 'all',
      only: '',
      force: false,
      commandArgs: ['generate:media', '--', '--category=all'],
    });
  });

  it('rejects invalid categories and unsafe prefixes', () => {
    expect(() => resolveGenerateMediaInput({ category: 'unknown' })).toThrow(
      'unknown media category',
    );
    expect(() => resolveGenerateMediaInput({ only: '../secret' })).toThrow(
      'only must contain',
    );
  });

  it('restores history and marks interrupted jobs after restart', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'empery-admin-jobs-'));
    tempDirs.push(rootDir);
    mkdirSync(join(rootDir, 'data'), { recursive: true });
    writeFileSync(
      join(rootDir, 'data/admin-jobs.json'),
      JSON.stringify({
        version: 1,
        jobs: [
          {
            id: 'interrupted',
            kind: 'generate_media',
            status: 'running',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            createdBy: 'admin',
            args: {},
            log: [],
          },
        ],
      }),
    );

    configureAdminJobs(rootDir);

    expect(listAdminJobs()).toMatchObject([
      {
        id: 'interrupted',
        status: 'error',
        error: 'Server restarted while the job was active',
      },
    ]);
  });
});
