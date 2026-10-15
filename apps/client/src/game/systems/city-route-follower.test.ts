import { describe, expect, it, vi } from 'vitest';
import { CityRouteFollower, type CityRouteWorld } from './city-route-follower.js';
import { CityStageMotion } from './city-stage-motion.js';

function fixture() {
  const state = { pose: { x: 0, y: 0 }, blocked: false, revision: 0, unavailable: false, shortened: false };
  const world: CityRouteWorld = {
    position: () => state.pose,
    move: point => { state.pose = { ...point }; },
    route: vi.fn((from, to) => state.unavailable ? [] : [from, { x: state.shortened ? 30 : to.x, y: to.y }]),
    revision: () => state.revision,
    walkable: point => !state.blocked || point.x < 40,
  };
  return { state, world, motion: new CityRouteFollower(world) };
}
describe('city route follower', () => {
  it.each([30, 60, 144])('preserves speed and waits at an obstacle at %i FPS', fps => {
    const { motion, state, world } = fixture();
    motion.setGoal({ x: 300, y: 0 });
    for (let i = 0; i < fps; i++) motion.step(1000 / fps, 30);
    expect(state.pose.x).toBeCloseTo(30, 6);
    state.blocked = true;
    for (let i = 0; i < fps * 20; i++) expect(motion.step(1000 / fps, 30)).toBe(false);
    expect(state.pose.x).toBeLessThan(40);
    expect(vi.mocked(world.route).mock.calls.length).toBeLessThan(12);
    state.blocked = false;
    state.revision++;
    for (let i = 0; i < fps * 10; i++) motion.step(1000 / fps, 30);
    expect(state.pose.x).toBeCloseTo(300, 6);
  });
  it('checks intermediate points when a frame has a large movement budget', () => {
    const { motion, state, world } = fixture();
    world.walkable = point => point.x < 40 || point.x > 60;
    motion.setGoal({ x: 300, y: 0 });
    expect(motion.step(500, 600)).toBe(false);
    expect(state.pose.x).toBeLessThan(40);
  });
  it('does not accept a shortened route as arrival or rebuild it every frame', () => {
    const { motion, state, world } = fixture();
    state.shortened = true;
    for (let i = 0; i < 600; i++) {
      motion.setGoal({ x: 300, y: 0 });
      expect(motion.step(1000 / 60, 60)).toBe(false);
    }
    expect(state.pose.x).toBe(30);
    expect(vi.mocked(world.route).mock.calls.length).toBeLessThan(10);
  });
  it('retains unavailable targets and retries immediately when obstacles change', () => {
    const { motion, state, world } = fixture();
    state.unavailable = true;
    motion.setGoal({ x: 300, y: 0 });
    for (let i = 0; i < 100; i++) motion.step(100, 30);
    const attempts = vi.mocked(world.route).mock.calls.length;
    state.unavailable = false;
    state.revision++;
    motion.step(100, 30);
    expect(vi.mocked(world.route).mock.calls.length).toBe(attempts + 1);
    expect(state.pose.x).toBeGreaterThan(0);
  });
  it('uses one distance budget across corners', () => {
    const { motion, state, world } = fixture();
    world.route = () => [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 30, y: 3 }];
    motion.setGoal({ x: 30, y: 3 });
    motion.step(100, 100);
    expect(state.pose).toEqual({ x: 7, y: 3 });
  });
  it('ignores invalid or stationary movement speeds', () => {
    const { motion, state } = fixture();
    motion.setGoal({ x: 300, y: 0 });
    for (const speed of [0, -1, NaN, Infinity]) expect(motion.step(100, speed)).toBe(false);
    expect(state.pose).toEqual({ x: 0, y: 0 });
  });
});

describe('stage schedule movement', () => {
  const entry = (asleep = false, atSeat = false) => ({ id: 'stage_bard', x: 0, y: 0, asleep, atSeat });
  it('rests on physical arrival without waiting for the scheduled arrival time or waking again', () => {
    const { state, world } = fixture();
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, { x: 300, y: 0 });
    stage.seed(entry(false, true));
    const walking = { ...entry(), x: 50, walkT: 0.1 };
    for (let i = 0; i < 80; i++) stage.update(walking, true, 100, 60);
    expect(state.pose.x).toBeGreaterThanOrEqual(284);
    expect(stage.asleep).toBe(true);
    const pose = { ...state.pose };
    stage.update(walking, true, 100, 60);
    expect(stage.asleep).toBe(true);
    expect(state.pose).toEqual(pose);
  });
  it('keeps a joining sleeper hidden until its home entrance is available', () => {
    const { state, world } = fixture();
    let door: { x: number; y: number } | null = null;
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, () => door);
    stage.seed(entry(true));
    stage.update(entry(false, true), false, 100, 60);
    expect(stage.asleep).toBe(true);
    expect(world.route).not.toHaveBeenCalled();
    door = { x: 300, y: 0 };
    state.revision++;
    stage.update(entry(false, true), false, 100, 60);
    expect(stage.asleep).toBe(false);
    expect(state.pose.x).toBeGreaterThan(290);
    expect(state.pose.x).toBeLessThan(300);
  });
  it('waits outdoors for a missing home entrance and follows its new resolved position', () => {
    const { state, world } = fixture();
    let door: { x: number; y: number } | null = { x: 300, y: 0 };
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, () => door);
    stage.seed(entry(false, true));
    stage.update(entry(true), true, 100, 60);
    const before = state.pose.x;
    door = null;
    state.revision++;
    for (let i = 0; i < 20; i++) stage.update(entry(true), true, 100, 60);
    expect(state.pose.x).toBe(before);
    expect(stage.asleep).toBe(false);
    door = { x: 400, y: 0 };
    state.revision++;
    for (let i = 0; i < 100; i++) stage.update(entry(true), true, 100, 60);
    expect(stage.asleep).toBe(true);
    expect(state.pose.x).toBeGreaterThan(380);
    expect(vi.mocked(world.route).mock.calls.at(-1)?.[1]).toEqual(door);
  });
  it('respects zero morning progress when server indoor and client entrance poses differ', () => {
    const { state, world } = fixture();
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, { x: 300, y: 0 });
    stage.seed(entry(true));
    stage.update({ ...entry(), x: 300, y: -30, walkT: 0 }, false, 100, 60);
    expect(stage.asleep).toBe(true);
    expect(state.pose).toEqual({ x: 300, y: 0 });
    stage.update({ ...entry(), x: 290, y: -30, walkT: 0.1 }, false, 100, 60);
    expect(stage.asleep).toBe(false);
    expect(state.pose.x).toBeLessThan(300);
  });
  it.each([9999, NaN, Infinity])('rejects unsafe legacy join coordinate %s without commute progress', coordinate => {
    const { state, world } = fixture();
    world.walkable = point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x <= 300 && point.y === 0;
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, { x: 300, y: 0 });
    stage.seed({ ...entry(), x: coordinate, y: coordinate }, true);
    expect(state.pose).toEqual({ x: 0, y: 0 });
  });
  it('uses commute progress on a collision-safe path when joining between phases', () => {
    const {state,world}=fixture();
    const stage=new CityStageMotion(world,{x:0,y:0},{x:300,y:0});
    stage.seed({...entry(),x:9999,y:9999,walkT:0.5},true);
    expect(state.pose).toEqual({x:150,y:0});
  });
  it('does not hide a performer remotely or seat it before physical arrival', () => {
    const { state, world } = fixture();
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, { x: 300, y: 0 });
    stage.seed(entry(false, true));
    state.unavailable = true;
    for (let i = 0; i < 100; i++) stage.update(entry(true), true, 100, 60);
    expect(stage.asleep).toBe(false);
    expect(stage.atSeat).toBe(false);
    state.unavailable = false;
    state.revision++;
    for (let i = 0; i < 100; i++) stage.update(entry(true), true, 100, 60);
    expect(stage.asleep).toBe(true);
    stage.update(entry(false, true), false, 100, 60);
    expect(stage.asleep).toBe(false);
    expect(stage.atSeat).toBe(false);
    for (let i = 0; i < 100; i++) stage.update(entry(false, true), false, 100, 60);
    expect(stage.atSeat).toBe(true);
  });
  it('seeds a joining sleeper indoors while live snapshots retain continuity', () => {
    const { state, world } = fixture();
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, { x: 300, y: 0 });
    stage.seed(entry(true));
    expect(state.pose.x).toBe(300);
    stage.update(entry(false, true), false, 100, 60);
    expect(state.pose.x).toBeLessThan(300);
    expect(state.pose.x).toBeGreaterThan(290);
  });
  it('requires physical seat arrival after a seated actor has drifted away', () => {
    const { state, world } = fixture();
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, { x: 300, y: 0 });
    stage.seed(entry(false, true));
    state.pose.y = -11;
    stage.update(entry(false, true), false, 100, 60);
    expect(stage.atSeat).toBe(false);
    expect(state.pose.y).toBeGreaterThan(-11);
  });
  it('waits for the server departure wave rather than moving at the first rest tick', () => {
    const { state, world } = fixture();
    const stage = new CityStageMotion(world, { x: 0, y: 0 }, { x: 300, y: 0 });
    stage.seed(entry(false, true));
    stage.update(entry(false, false), true, 100, 60);
    expect(state.pose.x).toBe(0);
    stage.update({ ...entry(), x: 1 }, true, 100, 60);
    expect(state.pose.x).toBeGreaterThan(0);
  });
});
