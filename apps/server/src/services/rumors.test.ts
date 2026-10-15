import { describe, it, expect, beforeEach } from 'vitest';
import { worldEvents } from './world-events.js';
import { getLatestRumors, getShadyRumors, resetRumorsForTests } from './rumors.js';

describe('rumors', () => {
  beforeEach(() => {
    resetRumorsForTests();
  });

  it('builds craft and combat rumors from world events', async () => {
    await worldEvents.publish({
      type: 'PLAYER_ACTION',
      action: 'CRAFT',
      playerId: 'p1',
      locationId: 'empery_haven',
      payload: { itemName: 'Кожаные перчатки' },
    });
    await worldEvents.publish({
      type: 'PLAYER_ACTION',
      action: 'COMBAT',
      playerId: 'p1',
      locationId: 'adena_fields',
      payload: { enemyName: 'Полевой волк' },
    });

    const latest = getLatestRumors();
    expect(latest[0]).toContain('Полевой волк');
    expect(latest.some((r) => r.includes('Кожаные перчатки'))).toBe(true);

    const shady = getShadyRumors();
    expect(shady[0]).toContain('Полевой волк');
  });

  it('records inn rest as a town rumor', async () => {
    await worldEvents.publish({
      type: 'PLAYER_ACTION',
      action: 'REST',
      playerId: 'p1',
      locationId: 'empery_haven',
      payload: { action: 'REST_AT_INN' },
    });
    expect(getLatestRumors()[0]).toContain('трактире');
  });

  it('falls back when buffer empty', () => {
    expect(getLatestRumors()).toEqual(['В городе подозрительно тихо...']);
    expect(getShadyRumors().length).toBeGreaterThan(0);
  });
});
