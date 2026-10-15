import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  combatBatchAttack: vi.fn(),
  encounterSyncQuests: vi.fn(),
  encounterFarmRespawn: vi.fn(),
  startEncounter: vi.fn(),
}));

vi.mock('../../api.js', () => api);

import { NetworkManager } from './NetworkManager.js';

describe('NetworkManager abort/generation', () => {
  let net: NetworkManager;

  beforeEach(() => {
    net = new NetworkManager();
    net.setSaveId('save-1');
    vi.clearAllMocks();
  });
  it('does not restore an old encounter after leaving the scene', async () => {
    let complete!: (value: unknown) => void;
    api.startEncounter.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const pending = net.startEncounter('adena_fields');
    const rejection = expect(pending).rejects.toThrow();
    net.abort();
    complete({ encounterId: 'old', entities: [] });
    await rejection;
    expect(net.getEncounterId()).toBeNull();
  });
  it('keeps the newest encounter when overlapping starts finish in reverse order', async () => {
    let oldComplete!: (value: unknown) => void;
    api.startEncounter.mockReturnValueOnce(new Promise(resolve => { oldComplete = resolve; }))
      .mockResolvedValueOnce({ encounterId: 'new', entities: [] });
    const old = net.startEncounter('old_location');
    const rejection = expect(old).rejects.toThrow();
    await net.startEncounter('new_location');
    oldComplete({ encounterId: 'old', entities: [] });
    await rejection;
    expect(net.getEncounterId()).toBe('new');
  });
  it('does not cancel combat when an independent quest sync starts', async () => {
    net['encounterId'] = 'enc-1';
    api.combatBatchAttack.mockResolvedValue({ hits: [] });
    api.encounterSyncQuests.mockResolvedValue({ entities: [] });
    const combat = net.batchAttack({ moving: false, dashing: false, nearbyEnemyCount: 0, targetEntityIds: [] });
    const signal = api.combatBatchAttack.mock.calls[0]![2] as AbortSignal;
    const quests = net.syncQuests();
    expect(signal.aborted).toBe(false);
    await Promise.all([combat, quests]);
    net.abort();
    expect(signal.aborted).toBe(true);
  });

  it('increments generation on abort and drops stale batchAttack results', async () => {
    const genBefore = net.getGeneration();
    let resolveAttack!: (v: unknown) => void;
    api.combatBatchAttack.mockReturnValue(
      new Promise((r) => {
        resolveAttack = r;
      }),
    );

    net['encounterId'] = 'enc-1';
    const pending = net.batchAttack({
      moving: false,
      dashing: false,
      nearbyEnemyCount: 0,
      targetEntityIds: ['e1'],
    });

    net.abort();
    resolveAttack({ hits: [], player: {}, stats: {} });
    await expect(pending).resolves.toBeNull();
    expect(net.getGeneration()).toBe(genBefore + 1);
  });

  it('ignores syncQuests result after abort', async () => {
    net['encounterId'] = 'enc-1';
    let resolveSync!: (v: unknown) => void;
    api.encounterSyncQuests.mockReturnValue(
      new Promise((r) => {
        resolveSync = r;
      }),
    );

    const pending = net.syncQuests();
    net.abort();
    resolveSync({ entities: [{ entityId: 'x' }] });
    await expect(pending).resolves.toEqual([]);
  });

  it('ignores farmRespawn result after abort', async () => {
    net['encounterId'] = 'enc-1';
    let resolveFarm!: (v: unknown) => void;
    api.encounterFarmRespawn.mockReturnValue(
      new Promise((r) => {
        resolveFarm = r;
      }),
    );

    const pending = net.farmRespawn();
    net.abort();
    resolveFarm({ spawned: { entityId: 'mob-1' } });
    await expect(pending).resolves.toBeNull();
  });
});
