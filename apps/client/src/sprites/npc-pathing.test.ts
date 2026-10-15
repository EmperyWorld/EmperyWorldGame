import { describe, expect, it, vi } from 'vitest';
import { buildNpcRoute, clearNpcRouteCache } from './npc-pathing.js';
import { isInsidePropAabb, PROP_COLLIDER_GROUP_KEY } from './prop-colliders.js';

function mockScene(
  colliders: Array<{ left: number; right: number; top: number; bottom: number }> = [],
): Phaser.Scene {
  const group = {
    scene: {},
    children: {},
    getLength: () => colliders.length,
    getChildren: () => colliders.map((body) => ({ body })),
  };
  return {
    data: new Map<string, unknown>([[PROP_COLLIDER_GROUP_KEY, group]]),
    physics: {
      world: {
        bounds: { x: 0, y: 0, right: 4000, bottom: 4000 },
      },
    },
  } as unknown as Phaser.Scene;
}

describe('npc-pathing', () => {
  it('builds street route and caches it', () => {
    clearNpcRouteCache();
    const scene = mockScene();

    // Route from tile (10, 10) to (20, 20)
    const route1 = buildNpcRoute(scene, 640, 640, 1280, 1280, 1);
    expect(route1.length).toBeGreaterThan(1);
    expect(route1[0]).toBeDefined();

    // Second call should return cached instance
    const route2 = buildNpcRoute(scene, 640, 640, 1280, 1280, 1);
    expect(route2).toBe(route1);

    clearNpcRouteCache();
    // After clear, builds new instance
    const route3 = buildNpcRoute(scene, 640, 640, 1280, 1280, 1);
    expect(route3).toEqual(route1);
  });

  it('keeps exact endpoints and isolates cache entries between scenes',()=>{
    const scene=mockScene();const first=buildNpcRoute(scene,650,650,1290,1290,1);
    const other=buildNpcRoute(scene,670,670,1310,1310,1);expect(other).not.toBe(first);expect(first[0]).toEqual({x:650,y:650});expect(other.at(-1)).toEqual({x:1310,y:1310});
    const blockedScene=mockScene([{left:1270,right:1330,top:1270,bottom:1330}]);const blocked=buildNpcRoute(blockedScene,670,670,1310,1310,1);expect(blocked).not.toBe(other);expect(isInsidePropAabb(blockedScene,blocked.at(-1)!.x,blocked.at(-1)!.y,13)).toBe(false);
  });
  it('builds the prop index once instead of rescanning all bodies on each local query',()=>{
    const scene=mockScene(Array.from({length:500},(_,i)=>({left:i*32,right:i*32+12,top:200,bottom:220})));
    const group=scene.data.get(PROP_COLLIDER_GROUP_KEY);const reads=vi.spyOn(group,'getChildren');
    for(let i=0;i<1000;i++)expect(isInsidePropAabb(scene,5,210,0)).toBe(true);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('uses a direct safe route for short local walks instead of crossing the whole city',()=>{
    const route=buildNpcRoute(mockScene(),700,700,740,730,1);expect(route).toEqual([{x:700,y:700},{x:740,y:730}]);
  });
  it('never substitutes a blocked street route when no detour can be found',()=>{
    const scene=mockScene([{left:900,right:1100,top:0,bottom:4000}]);expect(buildNpcRoute(scene,640,640,1280,1280,1)).toEqual([]);
  });

  it('ends at the nearest walkable cell when the requested goal is blocked', () => {
    clearNpcRouteCache();
    const scene = mockScene([
      { left: 1264, right: 1296, top: 1264, bottom: 1296 },
    ]);

    const route = buildNpcRoute(scene, 640, 640, 1280, 1280, 1);
    const end = route.at(-1)!;

    expect(end).not.toEqual({ x: 1280, y: 1280 });
    expect(isInsidePropAabb(scene, end.x, end.y, 13)).toBe(false);
  });

  it('detours around a thin footprint between otherwise free grid nodes', () => {
    const scene = mockScene([{ left: 747, right: 749, top: 650, bottom: 750 }]);
    const route = buildNpcRoute(scene, 700, 700, 820, 700, 1);
    expect(route.length).toBeGreaterThan(2);
    expect(route[0]).toEqual({ x: 700, y: 700 });
    expect(route.at(-1)).toEqual({ x: 820, y: 700 });
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!, b = route[i]!;
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        expect(isInsidePropAabb(scene, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 13)).toBe(false);
      }
    }
  });
});
