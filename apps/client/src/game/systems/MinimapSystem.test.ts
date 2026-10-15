import { describe, expect, it } from 'vitest';
import {
  MinimapSystem,
  NAVIGATION_ARRIVE_RADIUS,
  infrastructureMarkerStyle,
  navigationTargetReached,
} from './MinimapSystem.js';

type NpcPoint = { id: string; x: number; y: number };

function hashFor(
  npcs: NpcPoint[],
  partySaveIds?: ReadonlySet<string>,
): number {
  const minimap = new MinimapSystem();
  const entities = {
    forEachActive: (_fn: (enemy: { x: number; y: number }) => void) => undefined,
    forEachNpc: (fn: (npc: NpcPoint) => void) => {
      for (const npc of npcs) fn(npc);
    },
  };
  const remotes = {
    forEachPresence: (
      _fn: (x: number, y: number, presence: { saveId: string; hp: number }) => void,
    ) => undefined,
  };
  const buildDirtyHash = (
    minimap as unknown as {
      buildDirtyHash: (
        x: number,
        y: number,
        entities: unknown,
        remotes: unknown,
        partyIds?: ReadonlySet<string>,
      ) => number;
    }
  ).buildDirtyHash.bind(minimap);
  return buildDirtyHash(100, 100, entities, remotes, partySaveIds);
}

describe('MinimapSystem dirty hash', () => {
  it('changes when a scheduled city NPC crosses a minimap cell', () => {
    const before = hashFor([{ id: 'town_guard', x: 100, y: 100 }]);
    const after = hashFor([{ id: 'town_guard', x: 140, y: 100 }]);
    expect(after).not.toBe(before);
  });

  it('changes when party membership changes but party size stays equal', () => {
    const first = hashFor([], new Set(['same-prefix-player-a']));
    const second = hashFor([], new Set(['same-prefix-player-b']));
    expect(second).not.toBe(first);
  });
});

describe('city navigation arrival', () => {
  it('completes only inside the configured world radius', () => {
    const target = { x: 100, y: 100 };
    expect(
      navigationTargetReached(100 + NAVIGATION_ARRIVE_RADIUS, 100, target),
    ).toBe(true);
    expect(
      navigationTargetReached(101 + NAVIGATION_ARRIVE_RADIUS, 100, target),
    ).toBe(false);
  });

  it('distinguishes public utilities and key city services', () => {
    expect(infrastructureMarkerStyle('water', 'station').color).toBe(0x65c8ff);
    expect(infrastructureMarkerStyle('campfire', 'station').color).toBe(0xff9a4a);
    expect(infrastructureMarkerStyle('healer', 'landmark').color).toBe(0x70df9a);
    expect(infrastructureMarkerStyle('map_shop', 'landmark').radius).toBeGreaterThan(
      infrastructureMarkerStyle('memorial', 'landmark').radius,
    );
  });
});
