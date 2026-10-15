import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeHavenSchedule, type HavenAmbientScheduleEntry } from '@empery/shared';
import { CITIZEN_DEFS, ALL_CITIZEN_DEFS } from './haven-ambient-defs.js';

const world = vi.hoisted(() => ({
  revision: 0,
  routeBlocked: false,
  groundBlocked: false,
  propBlocked: false,
  adjustedGoal: false,
  obstacleRange: null as [number, number] | null,
  doorBlocked: false,
  indoorRouteBlocked: false,
}));
vi.mock('phaser', () => ({ default: { Math: { Linear: (a: number, b: number, t: number) => a + (b - a) * t } } }));
vi.mock('./sprite-factory.js', () => ({ COMBAT_ATLAS_KEY: 'atlas', playerSpriteFrame: vi.fn(), playerSpritePrefix: vi.fn() }));
vi.mock('./sprite-loader.js', () => ({ setupSpriteDisplay: vi.fn() }));
vi.mock('./visual-polish.js', () => ({ attachEntityShadow: vi.fn(), entityDepth: (y: number) => y, syncEntityShadow: vi.fn() }));
vi.mock('../world-clock.js', () => ({ getHavenSchedule: vi.fn(), subscribeHavenSchedule: vi.fn() }));
vi.mock('./world-tiles.js', () => ({ isTileBlockedAt: (_scene: unknown, x: number, y: number) => world.groundBlocked || (world.doorBlocked && x === 300 && y >= 130) }));
vi.mock('./prop-colliders.js', () => ({
  propCollisionRevision: () => world.revision,
  isInsidePropAabb: (_scene: unknown, x: number) => world.propBlocked || Boolean(world.obstacleRange && x >= world.obstacleRange[0] && x <= world.obstacleRange[1]),
  nudgePointFromPropColliders: (_scene: unknown, x: number, y: number) => ({ x, y }),
}));
vi.mock('./npc-pathing.js', () => ({
  clearNpcRouteCache: vi.fn(),
  buildNpcRoute: vi.fn((_scene: unknown, x: number, y: number, tx: number, ty: number) =>
    world.routeBlocked || (world.indoorRouteBlocked && x === 300 && y === 100) ? [] : [{ x, y }, { x: world.adjustedGoal ? tx - 150 : tx, y: ty }]),
}));

import { applyCitizenSchedule, beginStreetRoute, snapCitizenToSchedule, walkStreetRoute, type AmbientCitizen } from './haven-citizens.js';
import { buildNpcRoute } from './npc-pathing.js';

function citizen(x = 100, y = 130): AmbientCitizen {
  const sprite = {
    x, y, active: true, visible: true, alpha: 1,
    scene: { tweens: { killTweensOf: vi.fn() } },
    setPosition(nx: number, ny: number) { this.x = nx; this.y = ny; return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setAlpha(value: number) { this.alpha = value; return this; },
    clearTint: vi.fn(), setScale: vi.fn(), setFlipX: vi.fn(), setDepth: vi.fn(),
  };
  return {
    sprite, path: [{ x: 100, y: 130 }, { x: 200, y: 130 }], seg: 0,
    speed: 36, pauseMs: 1000, wait: 0, bobPhase: 0, walkPhase: 0,
    animable: false, racePrefix: null, dayRoaming: true, asleep: false,
    sleepX: 300, sleepY: 100, postX: 100, postY: 130,
    nightPatrolOnly: false, baseScale: 1, slotIndex: 0, schedKey: 'at_post:0',
    route: null, routeSeg: 0, routeKey: '', routeRevision: -1,
    routeTarget: null, routeRetryMs: 0, stuckMs: 0, repathCount: 0,
    lane: 1, homeTransition: 'none', homeTransitionT: 0, homeStartX: x, homeStartY: y,
  } as unknown as AmbientCitizen;
}
const home = (phase: HavenAmbientScheduleEntry['phase'] = 'walking_home', walkT = 1): HavenAmbientScheduleEntry =>
  ({ phase, walkT, asleep: phase === 'at_home' });
function advance(cit: AmbientCitizen, entry: HavenAmbientScheduleEntry, seconds: number, fps = 60) {
  for (let i = 0; i < seconds * fps; i++) applyCitizenSchedule(cit, entry, 1 / fps);
}
beforeEach(() => {
  Object.assign(world, { revision: 0, routeBlocked: false, groundBlocked: false, propBlocked: false, adjustedGoal: false, obstacleRange: null, doorBlocked: false, indoorRouteBlocked: false });
  vi.clearAllMocks();
});

describe('resident commutes and home transitions', () => {
  it.each([0,CITIZEN_DEFS.length,CITIZEN_DEFS.length+4,ALL_CITIZEN_DEFS.length-1])('completes a full daily cycle for resident %i without clock-edge teleports', index => {
    const cit=citizen();
    cit.slotIndex=index;cit.nightPatrolOnly=Boolean(ALL_CITIZEN_DEFS[index]!.nightPatrolOnly);
    const clock={cycleMs:24*60000,epochMs:0};
    snapCitizenToSchedule(cit,computeHavenSchedule(0,clock).ambient[index]!,{force:true});
    let sawDay=false,sawNight=false,entered=0,exited=0;
    for(let now=500;now<=24*60000;now+=500){
      const entry=computeHavenSchedule(now,clock).ambient[index]!;
      const before={x:cit.sprite.x,y:cit.sprite.y,asleep:cit.asleep};
      applyCitizenSchedule(cit,entry,.5);
      if(!before.asleep&&!cit.asleep)expect(Math.hypot(cit.sprite.x-before.x,cit.sprite.y-before.y)).toBeLessThanOrEqual(36*.5+16);
      if(!before.asleep&&cit.asleep)entered++;
      if(before.asleep&&!cit.asleep)exited++;
      if(!cit.asleep){if(now<7*60000||now>21*60000)sawNight=true;else sawDay=true;}
    }
    expect(entered).toBeGreaterThan(0);expect(exited).toBeGreaterThan(0);
    expect(cit.nightPatrolOnly?sawNight:sawDay).toBe(true);
  });
  it('uses northern atlas frames during actual northbound street movement', () => {
    const cit = citizen(100, 200);
    cit.racePrefix = 'npc-town_merchant';
    cit.animable = true;
    Object.assign(cit.sprite, { texture:{has:()=>true}, anims:{isPlaying:false,stop:vi.fn()}, setFrame:vi.fn() });
    Object.assign(cit.sprite.scene, { anims:{exists:()=>false} });
    beginStreetRoute(cit, 100, 200, 100, 130, true);
    walkStreetRoute(cit, 0.1);
    expect(cit.walkFacing).toBe('up');
    expect(cit.sprite.setFrame).toHaveBeenLastCalledWith(expect.stringContaining('npc-town_merchant-up-'));
    beginStreetRoute(cit, cit.sprite.x, cit.sprite.y, 100, 300, true);
    walkStreetRoute(cit, 0.1);
    expect(cit.walkFacing).toBe('down');
    expect(cit.sprite.setFrame).toHaveBeenLastCalledWith(expect.stringMatching(/^npc-town_merchant-[123]$/));
  });
  it('keeps a dawn guard outdoors until it physically reaches its entrance, even after scheduled arrival', () => {
    const cit = citizen();
    cit.nightPatrolOnly = true;
    cit.schedKey = 'patrol:0';
    snapCitizenToSchedule(cit, home('walking_home', 0));
    expect(cit.sprite.x).toBe(100);
    advance(cit, home('at_home'), 1);
    expect(cit.sprite.visible).toBe(true);
    expect(cit.sprite.alpha).toBe(1);
    expect(cit.sprite.x).toBeGreaterThan(100);
    expect(cit.sprite.x).toBeLessThan(300);
    advance(cit, home('at_home'), 10);
    expect(cit.asleep).toBe(true);
    expect(cit.sprite.visible).toBe(false);
  });

  it('brings a resting night guard through the doorway and back to its patrol post', () => {
    const cit = citizen();
    cit.nightPatrolOnly = true;
    snapCitizenToSchedule(cit, home('at_home'), { force: true });
    const patrol: HavenAmbientScheduleEntry = { phase: 'patrol', asleep: false, walkT: 0 };
    snapCitizenToSchedule(cit, patrol);
    expect(cit.sprite.visible).toBe(false);
    advance(cit, patrol, 12);
    expect(cit.asleep).toBe(false);
    expect(cit.sprite.visible).toBe(true);
    expect(cit.dayRoaming).toBe(true);
    expect(Math.abs(cit.sprite.x - cit.postX)).toBeLessThan(40);
  });

  it('seeds a morning join from the outdoor entrance instead of the blocked indoor pose', () => {
    const cit = citizen();
    world.indoorRouteBlocked = true;
    snapCitizenToSchedule(cit, { phase: 'walking_to_post', asleep: false, walkT: 0.5 }, { force: true });
    expect(cit.sprite.x).toBe(200);
    expect(cit.sprite.y).toBe(130);
  });

  it('keeps a sleeper hidden until a valid entrance becomes available', () => {
    const cit = citizen();
    snapCitizenToSchedule(cit, home('at_home'), { force: true });
    world.doorBlocked = true;
    const entry: HavenAmbientScheduleEntry = { phase: 'walking_to_post', asleep: false, walkT: 1 };
    advance(cit, entry, 2);
    expect(cit.asleep).toBe(true);
    expect(cit.sprite.visible).toBe(false);
    expect(cit.homeTransition).toBe('none');
    expect(buildNpcRoute).not.toHaveBeenCalled();
    world.doorBlocked = false;
    world.revision++;
    advance(cit, entry, 8);
    expect(cit.dayRoaming).toBe(true);
  });

  it('does not invent a blocked doorway for an outdoor evening commute', () => {
    const cit = citizen();
    world.doorBlocked = true;
    advance(cit, home('at_home'), 3);
    expect(cit.sprite.x).toBe(100);
    expect(cit.sprite.y).toBe(130);
    expect(cit.sprite.visible).toBe(true);
    expect(buildNpcRoute).not.toHaveBeenCalled();
  });

  it('pauses a home exit if its entrance is blocked during the fade', () => {
    const cit = citizen();
    snapCitizenToSchedule(cit, home('at_home'), { force: true });
    const entry: HavenAmbientScheduleEntry = { phase: 'at_post', asleep: false, walkT: 1 };
    applyCitizenSchedule(cit, entry, 0.1);
    const pose = { x: cit.sprite.x, y: cit.sprite.y, alpha: cit.sprite.alpha, progress: cit.homeTransitionT };
    world.doorBlocked = true;
    world.revision++;
    applyCitizenSchedule(cit, entry, 0.1);
    expect({ x: cit.sprite.x, y: cit.sprite.y, alpha: cit.sprite.alpha, progress: cit.homeTransitionT }).toEqual(pose);
    world.doorBlocked = false;
    world.revision++;
    advance(cit, entry, 8);
    expect(cit.dayRoaming).toBe(true);
  });

  it('checks intermediate collision points during a deferred offscreen update', () => {
    const cit = citizen();
    cit.speed = 100;
    beginStreetRoute(cit, 100, 130, 300, 130, true);
    world.obstacleRange = [118, 130];
    expect(walkStreetRoute(cit, 0.5)).toBe(false);
    expect(cit.sprite.x).toBeLessThan(118);
    expect(cit.sprite.x).toBeGreaterThan(100);
  });

  it('does not report a shortened route as arrival at the requested patrol point', () => {
    const cit = citizen();
    world.adjustedGoal = true;
    beginStreetRoute(cit, 100, 130, 300, 130, true);
    for (let i = 0; i < 600; i++) expect(walkStreetRoute(cit, 1 / 60)).toBe(false);
    expect(cit.sprite.x).toBe(150);
    expect(cit.routeTarget).toEqual({ x: 300, y: 130 });
    expect(vi.mocked(buildNpcRoute).mock.calls.length).toBeLessThan(10);
  });

  it('spends one frame budget across a chain of short corners', () => {
    const cit = citizen();
    vi.mocked(buildNpcRoute).mockImplementationOnce(() => Array.from({ length: 13 }, (_, i) => ({ x: 100 + i, y: 130 })));
    beginStreetRoute(cit, 100, 130, 112, 130, true);
    expect(walkStreetRoute(cit, 0.5)).toBe(true);
    expect(cit.sprite.x).toBe(112);
  });

  it.each([30, 60, 144])('waits outdoors on a blocked route at %i FPS, then enters after the gate opens', (fps) => {
    const cit = citizen();
    world.routeBlocked = true;
    advance(cit, home(), 10, fps);
    // The authoritative sleep phase closes services, but cannot finish a visible walk remotely.
    snapCitizenToSchedule(cit, home('at_home'));
    advance(cit, home('at_home'), 10, fps);
    expect(cit.sprite.visible).toBe(true);
    expect(cit.asleep).toBe(false);
    expect(cit.homeTransition).toBe('none');
    expect(cit.sprite.x).toBe(100);
    expect(vi.mocked(buildNpcRoute).mock.calls.length).toBeLessThan(12);
    world.routeBlocked = false;
    world.revision++;
    advance(cit, home('at_home'), 8, fps);
    expect(cit.asleep).toBe(true);
    expect(cit.sprite.visible).toBe(false);
    expect(cit.sprite.x).toBe(300);
    expect(cit.sprite.y).toBe(100);
  });

  it.each([0, 0.1, 0.5])('enters on physical arrival even while schedule progress is %s', walkT => {
    const cit = citizen(300, 130);
    advance(cit, home('walking_home', walkT), 1);
    expect(cit.homeTransition).toBe('none');
    expect(cit.asleep).toBe(true);
    expect(cit.sprite.visible).toBe(false);
    // Stale commute messages must not bring the sleeper outdoors again.
    snapCitizenToSchedule(cit, home('walking_home', walkT));
    advance(cit, home('walking_home', walkT), 1);
    expect(cit.sprite.visible).toBe(false);
  });

  it('keeps an entry animation continuous across walking_home → at_home', () => {
    const cit = citizen(295, 140);
    applyCitizenSchedule(cit, home(), 0.05);
    applyCitizenSchedule(cit, home(), 0.05);
    const before = { x: cit.sprite.x, y: cit.sprite.y, alpha: cit.sprite.alpha, t: cit.homeTransitionT };
    snapCitizenToSchedule(cit, home('at_home'));
    expect(cit.sprite.x).toBe(before.x);
    expect(cit.sprite.y).toBe(before.y);
    expect(cit.sprite.alpha).toBe(before.alpha);
    expect(cit.homeTransitionT).toBe(before.t);
    advance(cit, home('at_home'), 1);
    expect(cit.asleep).toBe(true);
  });

  it('seeds initial night joins indoors without creating a commute', () => {
    const cit = citizen();
    snapCitizenToSchedule(cit, home('at_home'), { force: true });
    expect(cit.asleep).toBe(true);
    expect(cit.sprite.visible).toBe(false);
    expect(buildNpcRoute).not.toHaveBeenCalled();
  });

  it('does not enter a house from an adjusted route endpoint far from its door', () => {
    const cit = citizen();
    world.adjustedGoal = true;
    advance(cit, home(), 10);
    expect(cit.homeTransition).toBe('none');
    expect(cit.asleep).toBe(false);
    expect(cit.sprite.visible).toBe(true);
  });

  it.each(['groundBlocked', 'propBlocked'] as const)('never skips a waypoint or reports arrival through %s', (obstacle) => {
    const cit = citizen();
    beginStreetRoute(cit, 100, 130, 300, 130, true);
    world[obstacle] = true;
    for (let i = 0; i < 600; i++) expect(walkStreetRoute(cit, 1 / 60)).toBe(false);
    expect(cit.sprite.x).toBe(100);
    expect(cit.routeSeg).toBe(0);
    expect(cit.repathCount).toBeGreaterThan(1);
    expect(vi.mocked(buildNpcRoute).mock.calls.length).toBeLessThan(10);
  });

  it('does not start daytime roaming hundreds of pixels away from work', () => {
    const cit = citizen(300, 130);
    cit.dayRoaming = false;
    world.routeBlocked = true;
    advance(cit, { phase: 'walking_to_post', asleep: false, walkT: 1 }, 10);
    expect(cit.dayRoaming).toBe(false);
    expect(cit.sprite.x).toBe(300);
  });

  it('lets a resident who is still outside at dawn walk to work from its actual pose', () => {
    const cit = citizen(240, 130);
    world.routeBlocked = true;
    advance(cit, home('at_home'), 2);
    world.routeBlocked = false;
    world.revision++;
    advance(cit, { phase: 'walking_to_post', asleep: false, walkT: 0.2 }, 4);
    expect(cit.dayRoaming).toBe(true);
    expect(cit.sprite.visible).toBe(true);
    expect(cit.homeTransition).toBe('none');
    expect(cit.sprite.x).toBeLessThan(140);
  });

  it('plays the home exit even when a late morning snapshot skips walking_to_post', () => {
    const cit = citizen();
    snapCitizenToSchedule(cit, home('at_home'), { force: true });
    const entry: HavenAmbientScheduleEntry = { phase: 'at_post', asleep: false, walkT: 1 };
    snapCitizenToSchedule(cit, entry);
    expect(cit.sprite.visible).toBe(false);
    applyCitizenSchedule(cit, entry, 0.1);
    expect(cit.homeTransition).toBe('exiting');
    expect(cit.sprite.alpha).toBeLessThan(1);
    expect(cit.dayRoaming).toBe(false);
    advance(cit, entry, 8);
    expect(cit.homeTransition).toBe('none');
    expect(cit.dayRoaming).toBe(true);
    expect(cit.sprite.visible).toBe(true);
  });

  it('starts a live work route instead of accepting a remote at_post pose', () => {
    const cit = citizen(300, 130);
    cit.dayRoaming = false;
    snapCitizenToSchedule(cit, { phase: 'at_post', asleep: false, walkT: 1 });
    expect(cit.dayRoaming).toBe(false);
    expect(cit.routeTarget).toEqual({ x: 100, y: 130 });
    expect(cit.sprite.x).toBe(300);
  });
});
