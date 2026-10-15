import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '@empery/shared/world-collision';
import { PlayerMotion } from './player-motion.js';
const map = { width: 30, height: 30, tilewidth: 64, tileheight: 64, layers: [{ name: 'ground', data: Array(900).fill(1) }] };
describe('predicted foot and mounted movement', () => {
  it.each([30, 60, 144].flatMap(fps=>[180,300,600].map(speed=>({fps,speed}))))('keeps fixed-step speed and smooth display at $fps FPS with speed $speed', ({fps,speed}) => {
    const world = new CollisionWorld(map), motion = new PlayerMotion({ x: 100, y: 100 });
    let frames = 0, previous = 100;
    for (let i = 0; i < fps; i++) {
      frames += motion.advance(world, 1000 / fps, 1, 0, speed).length;
      const display = motion.renderPosition().x;
      expect(display).toBeGreaterThanOrEqual(previous);
      expect(display - previous).toBeLessThanOrEqual(speed / fps + 0.001);
      previous = display;
    }
    expect(frames).toBe(20);
    expect(motion.position().x).toBeCloseTo(100+speed);
    expect(motion.renderPosition().x).toBeCloseTo(100+speed*0.95);
  });
  it('stops a fast mounted click exactly at the target without oscillation', () => {
    const motion = new PlayerMotion({ x: 100, y: 100 }), world = new CollisionWorld(map);
    motion.advance(world, 200, 1, 0, 600, { x: 113, y: 100 });
    expect(motion.position()).toEqual({ x: 113, y: 100 });
  });
  it('sweeps against thin obstacles at mounted charge speed', () => {
    const motion = new PlayerMotion({ x: 100, y: 100 });
    const world = new CollisionWorld(map, [{ cx: 140, cy: 100, bw: 4, bh: 100 }]);
    motion.advance(world, 200, 1, 0, 600);
    expect(motion.position().x).toBeLessThanOrEqual(124);
    expect(world.blocked(motion.renderPosition().x, motion.renderPosition().y)).toBe(false);
  });
  it('uses only available transport slots and does not accumulate a catch-up sprint while suspended', () => {
    const world=new CollisionWorld(map),motion=new PlayerMotion({x:100,y:100});
    expect(motion.advance(world,200,1,0,300,null,1)).toHaveLength(1);expect(motion.x).toBe(115);
    for(let i=0;i<60;i++)expect(motion.advance(world,50,1,0,300,null,0)).toEqual([]);
    expect(motion.x).toBe(115);expect(motion.renderPosition().x).toBe(115);
    expect(motion.advance(world,16,1,0,300,null,4)).toEqual([]);
    expect(motion.advance(world,34,1,0,300,null,4)).toHaveLength(1);expect(motion.x).toBe(130);
  });
  it('keeps corrections through subsequent frames and resets on teleport', () => {
    const motion = new PlayerMotion({ x: 100, y: 100 }), world = new CollisionWorld(map);
    motion.advance(world, 75, 1, 0, 200);
    motion.correct({ x: 108, y: 100 });
    expect(motion.renderPosition().x).toBe(103);
    motion.advance(world, 25, 1, 0, 200);
    expect(motion.position().x).toBeCloseTo(118);
    motion.reset({ x: 500, y: 500 });
    expect(motion.renderPosition()).toEqual({ x: 500, y: 500 });
  });
});
