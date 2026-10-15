import { describe, expect, it, vi } from 'vitest';
import type { PlayerSave } from '../../api.js';
import type { LocationConfig } from '../scenes/location-types.js';
import { bootstrapEncounter, type EncounterBootstrapCtx } from './encounter-bootstrap.js';

function location(overrides: Partial<LocationConfig> = {}): LocationConfig {
  return {
    id: 'adena_fields',
    name: 'Fields',
    mapKey: 'map-adena_fields',
    spawn: { x: 100, y: 100 },
    npcs: [],
    ...overrides,
  };
}

function save(): PlayerSave {
  return { id: 's1', location: 'adena_fields' } as PlayerSave;
}

describe('bootstrapEncounter', () => {
  it('accepts the generation created by its own encounter start', async () => {
    let generation = 1;
    const spawnFromEncounter = vi.fn();
    const ok = await bootstrapEncounter({
      location: location(), save: save(), sceneGeneration: 1,
      network: { getGeneration: () => generation, startEncounter: async () => { generation++; return { encounterId: 'new', entities: [{ entityId: 'e1' }] }; } },
      entities: { recycleAll: vi.fn(), spawnFromEncounter }, quests: { refreshFromSave: vi.fn() },
    } as EncounterBootstrapCtx, () => 1);
    expect(ok).toBe(true);
    expect(spawnFromEncounter).toHaveBeenCalledWith([{ entityId: 'e1' }]);
  });
  it('does not refresh a destroyed scene after an old encounter request fails', async () => {
    let sceneGeneration = 1;
    const refreshFromSave = vi.fn();
    const ok = await bootstrapEncounter({
      location: location(), save: save(), sceneGeneration: 1,
      network: { getGeneration: () => 1, startEncounter: async () => { sceneGeneration++; throw new Error('aborted'); } },
      entities: { recycleAll: vi.fn(), spawnFromEncounter: vi.fn() }, quests: { refreshFromSave },
    } as EncounterBootstrapCtx, () => sceneGeneration);
    expect(ok).toBe(true);
    expect(refreshFromSave).not.toHaveBeenCalled();
  });
  it('recycles in a safe zone without starting an encounter', async () => {
    const startEncounter = vi.fn();
    const recycleAll = vi.fn();
    const refreshFromSave = vi.fn();
    const ok = await bootstrapEncounter(
      {
        location: location({ safeZone: true }),
        save: save(),
        sceneGeneration: 1,
        network: { getGeneration: () => 1, startEncounter },
        entities: { recycleAll, spawnFromEncounter: vi.fn() },
        quests: { refreshFromSave },
      } as EncounterBootstrapCtx,
      () => 1,
    );
    expect(ok).toBe(true);
    expect(startEncounter).not.toHaveBeenCalled();
    expect(recycleAll).toHaveBeenCalledTimes(1);
    expect(refreshFromSave).toHaveBeenCalledTimes(1);
  });

  it('spawns entities after a successful start', async () => {
    const spawnFromEncounter = vi.fn();
    const ok = await bootstrapEncounter(
      {
        location: location(),
        save: save(),
        sceneGeneration: 2,
        network: {
          getGeneration: () => 7,
          startEncounter: vi.fn(async () => ({
            encounterId: 'enc-1',
            entities: [{ entityId: 'e1' }],
          })),
        },
        entities: { recycleAll: vi.fn(), spawnFromEncounter },
        quests: { refreshFromSave: vi.fn() },
      } as EncounterBootstrapCtx,
      () => 2,
    );
    expect(ok).toBe(true);
    expect(spawnFromEncounter).toHaveBeenCalledWith([{ entityId: 'e1' }]);
  });

  it('returns false when startEncounter fails so reconnect can toast', async () => {
    const refreshFromSave = vi.fn();
    const ok = await bootstrapEncounter(
      {
        location: location(),
        save: save(),
        sceneGeneration: 1,
        network: {
          getGeneration: () => 1,
          startEncounter: vi.fn(async () => {
            throw new Error('offline');
          }),
        },
        entities: { recycleAll: vi.fn(), spawnFromEncounter: vi.fn() },
        quests: { refreshFromSave },
      } as EncounterBootstrapCtx,
      () => 1,
    );
    expect(ok).toBe(false);
    expect(refreshFromSave).toHaveBeenCalledTimes(1);
  });

  it('does not spawn if the scene generation changed mid-await', async () => {
    const spawnFromEncounter = vi.fn();
    let gen = 3;
    const ok = await bootstrapEncounter(
      {
        location: location(),
        save: save(),
        sceneGeneration: 3,
        network: {
          getGeneration: () => 1,
          startEncounter: vi.fn(async () => {
            gen = 4;
            return { encounterId: 'enc-1', entities: [{ entityId: 'e1' }] };
          }),
        },
        entities: { recycleAll: vi.fn(), spawnFromEncounter },
        quests: { refreshFromSave: vi.fn() },
      } as EncounterBootstrapCtx,
      () => gen,
    );
    expect(ok).toBe(true);
    expect(spawnFromEncounter).not.toHaveBeenCalled();
  });
});
