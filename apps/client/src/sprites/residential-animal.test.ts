import { beforeEach, describe, expect, it, vi } from 'vitest';
const terrain = vi.hoisted(() => ({ blocked: false }));
vi.mock('phaser', () => ({ default: { Scenes: { Events: { SHUTDOWN: 'shutdown' } } } }));
vi.mock('./npc-anchor.js', () => ({ resolveNpcAnchor: (_scene: unknown, x: number, y: number) => ({ x, y }) }));
vi.mock('./npc-pathing.js', () => ({ buildNpcRoute: (_scene: unknown, x: number, y: number, tx: number, ty: number) => [{ x, y }, { x: tx, y: ty }] }));
vi.mock('./world-tiles.js', () => ({ isTileBlockedAt: () => terrain.blocked }));
vi.mock('./prop-colliders.js', () => ({ isInsidePropAabb: () => false, propCollisionRevision: () => 0 }));
import { placeResidentialAnimal } from './residential-animal.js';

function fixture(kind: 'cat' | 'dog') {
  const graphic = () => {
    const obj = { x: 100, y: 200, destroy: vi.fn(), clear: vi.fn(), setPosition: vi.fn(), setDepth: vi.fn(), lineStyle: vi.fn(), lineBetween: vi.fn(), fillStyle: vi.fn(), fillEllipse: vi.fn(), fillCircle: vi.fn(), fillTriangle: vi.fn() };
    for (const method of ['clear', 'setDepth', 'lineStyle', 'lineBetween', 'fillStyle', 'fillEllipse', 'fillCircle', 'fillTriangle'] as const) obj[method].mockReturnValue(obj);
    obj.setPosition.mockImplementation((x: number, y: number) => { obj.x = x; obj.y = y; return obj; });
    return obj;
  };
  const body = graphic(), shadow = graphic();
  let update: (_time: number, delta: number) => void = () => {};
  let shutdown: () => void = () => {};
  const off = vi.fn();
  const scene = { add: { graphics: () => body, ellipse: () => shadow },
    events: { on: (_event: string, fn: typeof update) => { update = fn; }, once: (_event: string, fn: typeof shutdown) => { shutdown = fn; }, off } };
  placeResidentialAnimal(scene as unknown as Phaser.Scene, [{ x: 100, y: 200 }, { x: 300, y: 200 }], kind, 0xc8a878);
  return { body, shadow, step: (delta: number) => update(0, delta), shutdown: () => shutdown(), off };
}
beforeEach(() => { terrain.blocked = false; });
describe('grounded residential animals', () => {
  it.each([['cat', 6], ['dog', 8]] as const)('bounds %s travel during a slow frame and keeps the shadow on its feet', (kind, distance) => {
    const animal = fixture(kind);
    animal.step(1000);
    expect(animal.body.x).toBe(100 + distance);
    expect(animal.body.y).toBe(200);
    expect(animal.shadow.x).toBe(animal.body.x);
    expect(animal.shadow.y).toBe(animal.body.y);
  });
  it('waits at obstacles instead of tweening through houses', () => {
    const animal = fixture('cat');
    terrain.blocked = true;
    animal.step(250);
    expect(animal.body.x).toBe(100);
    terrain.blocked = false;
    animal.step(250);
    expect(animal.body.x).toBe(106);
  });
  it('removes its update and both ground objects on scene shutdown', () => {
    const animal = fixture('dog'); animal.shutdown();
    expect(animal.off).toHaveBeenCalledWith('update', expect.any(Function));
    expect(animal.body.destroy).toHaveBeenCalledOnce();
    expect(animal.shadow.destroy).toHaveBeenCalledOnce();
  });
});
