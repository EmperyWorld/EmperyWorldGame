import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '@empery/shared/world-collision';
import { InteractionApproach, interactionStandingPoint } from './interaction-approach.js';
import { PlayerNavigation } from './player-navigation.js';
import { PlayerMotion } from './player-motion.js';
const map = { width: 10, height: 10, tilewidth: 64, tileheight: 64, layers: [{ name: 'ground', data: Array(100).fill(1) }] };

describe('NPC interaction approach', () => {
  it.each([14, 20])('walks around a wall and follows a moving NPC with radius %i', radius => {
    const world = new CollisionWorld(map, [{ cx: 300, cy: 300, bw: 40, bh: 240 }], radius);
    const motion = new PlayerMotion({ x: 150, y: 300 });
    let target = { x: 450, y: 300 };
    const approach = new InteractionApproach('captain', () => target);
    let nav = new PlayerNavigation();
    let destination: { x: number; y: number } | null = null;
    let arrived = false;
    for (let frame = 0; frame < 400; frame++) {
      if (frame === 25) target = { x: 470, y: 400 };
      const position = { x: motion.x, y: motion.y };
      const result = approach.update(world, position, frame * 50, destination != null, nav.status === 'planning');
      if (result.kind === 'arrived') {
        expect(world.hasLineOfSight(position, target)).toBe(true);
        expect(Math.hypot(position.x-target.x, position.y-target.y)).toBeLessThanOrEqual(72);
        arrived = true; break;
      }
      if (result.kind === 'route') { destination = result.point; nav = new PlayerNavigation(); }
      expect(result.kind).not.toBe('unreachable');
      if (destination) {
        nav.update(world, position, destination);
        motion.advance(world, 50, 1, 0, 200, p => nav.waypoint(p));
        expect(world.blocked(motion.x, motion.y)).toBe(false);
        if (nav.status === 'arrived') destination = null;
        expect(nav.status).not.toBe('failed');
      }
    }
    expect(arrived).toBe(true);
  });
  it('does not interact through a wall even at talking distance', () => {
    const world = new CollisionWorld(map, [{ cx: 300, cy: 300, bw: 10, bh: 200 }]);
    const approach = new InteractionApproach('npc', () => ({ x: 325, y: 300 }));
    const result = approach.update(world, { x: 275, y: 300 }, 0, false, false);
    expect(result.kind).toBe('route');
    if (result.kind === 'route') expect(world.hasLineOfSight(result.point, { x: 325, y: 300 })).toBe(true);
  });
  it('keeps a pending search and cancels an unavailable target', () => {
    const world = new CollisionWorld(map);
    let target: { x: number; y: number } | null = { x: 400, y: 300 };
    const approach = new InteractionApproach('npc', () => target);
    expect(approach.update(world, {x:100,y:100}, 0, false, false).kind).toBe('route');
    target = { x: 500, y: 400 };
    expect(approach.update(world, {x:100,y:100}, 1000, true, true).kind).toBe('wait');
    expect(approach.update(world, {x:100,y:100}, 1000, true, false).kind).toBe('route');
    target = null;
    expect(approach.update(world, {x:100,y:100}, 1100, true, false).kind).toBe('unavailable');
  });
  it('rejects invalid target coordinates and fully enclosed standing points', () => {
    const world = new CollisionWorld(map, [{cx:300,cy:300,bw:180,bh:180}]);
    expect(interactionStandingPoint(world, {x:100,y:100}, {x:300,y:300})).toBeNull();
    expect(new InteractionApproach('npc',()=>({x:NaN,y:0})).update(world,{x:100,y:100},0,false,false).kind).toBe('unavailable');
  });
});
