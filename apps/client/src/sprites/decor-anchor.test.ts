import { beforeEach, describe, expect, it, vi } from 'vitest';

const geometry = vi.hoisted(() => ({ projectX: 0 }));
vi.mock('./npc-anchor.js', () => ({
  resolveNpcAnchor: (_scene: unknown, x: number, y: number) => ({ x: x + geometry.projectX, y }),
}));
vi.mock('./prop-colliders.js', () => ({ isInsidePropAabb: () => false }));
vi.mock('./world-tiles.js', () => ({ isTileBlockedAt: () => false }));
import { resolveDecorAnchor } from './decor-anchor.js';

describe('decorative actor reservations', () => {
  beforeEach(() => { geometry.projectX = 0; });
  it('keeps projected candidates clear of actors outside the authored search radius', () => {
    const scene = { events: { once: vi.fn() } } as unknown as Phaser.Scene;
    const first = resolveDecorAnchor(scene, 10300, 10000)!;
    geometry.projectX = 300;
    const second = resolveDecorAnchor(scene, 10000, 10000)!;
    expect(second).not.toBeNull();
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeGreaterThanOrEqual(36);
  });
  it('releases reservations when a scene shuts down and is reused', () => {
    let shutdown!: () => void;
    const scene = { events: { once: (_event: string, callback: () => void) => { shutdown = callback; } } } as unknown as Phaser.Scene;
    const first = resolveDecorAnchor(scene, 10000, 10000);
    expect(resolveDecorAnchor(scene, 10000, 10000)).not.toEqual(first);
    shutdown();
    expect(resolveDecorAnchor(scene, 10000, 10000)).toEqual(first);
  });
});
