import { describe, it, expect, vi } from 'vitest';
import { CollisionWorld } from '@empery/shared/world-collision';
import { PlayerNavigation, PLAYER_NAV_ARRIVAL_PX, resolvePlayerDestination } from './player-navigation.js';
import { readFileSync } from 'node:fs';
import { worldProps, propCollisionBoxes } from '@empery/shared/world-props';
import { HAVEN_APARTMENT_STREET, HAVEN_HQ_STREET } from '@empery/shared';
import { HAVEN } from '../../../../../scripts/layouts/empery_haven.mjs';
import { PlayerMotion } from './player-motion.js';
const map = { width: 10, height: 10, tilewidth: 64, tileheight: 64, layers: [{ name: 'ground', data: Array(100).fill(1) }] };
function plan(nav: PlayerNavigation, world: CollisionWorld, from={x:100,y:300}, target={x:500,y:300}) {
  for(let i=0;i<1000;i++){nav.update(world,from,target,30);if(nav.status!=='planning')break;}
}
describe('player navigation', () => {
  it.each([14,20].flatMap(radius=>[true,false].map(gatesOpen=>({radius,gatesOpen}))))('finds safe city routes with radius $radius, gatesOpen=$gatesOpen', ({radius,gatesOpen}) => {
    const authored = JSON.parse(readFileSync(new URL('../../../public/maps/empery_haven.json', import.meta.url),'utf8'));
    const boxes = worldProps('empery_haven', { stations: HAVEN.stations }).flatMap(([id,x,y,size])=>propCollisionBoxes(id,x,y,size,gatesOpen));
    const world = new CollisionWorld(authored, boxes, radius);
    const from = world.nearestWalkable({ x:2592,y:1312 });
    for (const target of [{x:864,y:736},{x:928,y:2464},{x:2304,y:2048},HAVEN_APARTMENT_STREET,HAVEN_HQ_STREET]) {
      const destination = resolvePlayerDestination(world,target)!;
      const nav = new PlayerNavigation(); plan(nav,world,from,destination);
      expect(nav.status, JSON.stringify(target)).toBe('following');
      for(let i=1;i<nav.path.length;i++)expect(world.canTraverse(nav.path[i-1]!,nav.path[i]!)).toBe(true);
    }
  });
  it.each([14,20])('finds an offset narrow turn missed by the coarse grid with radius %i', radius => {
    const top=299-radius-1, bottom=299+radius+1;
    const world=new CollisionWorld(map,[{cx:300,cy:top/2,bw:64,bh:top},{cx:300,cy:(640+bottom)/2,bw:64,bh:640-bottom}],radius);
    const nav=new PlayerNavigation(),from={x:100,y:200},target={x:500,y:200};
    plan(nav,world,from,target); expect(nav.status).toBe('following');expect(nav.resolution).toBe(4);
    const motion=new PlayerMotion(from);
    for(let i=0;i<500&&nav.status!=='arrived';i++)motion.advance(world,50,1,0,300,p=>nav.waypoint(p));
    expect(nav.status).toBe('arrived');expect(Math.hypot(motion.x-target.x,motion.y-target.y)).toBeLessThan(PLAYER_NAV_ARRIVAL_PX);expect(world.blocked(motion.x,motion.y)).toBe(false);
  });
  it('smooths the whole long winding route over bounded updates', () => {
    const longMap={...map,width:40,layers:[{name:'ground',data:Array(400).fill(1)}]};
    const boxes=Array.from({length:30},(_,i)=>({cx:128+i*80,cy:i%2?390:250,bw:16,bh:500}));
    const world=new CollisionWorld(longMap,boxes),nav=new PlayerNavigation();
    const from={x:48,y:560},target={x:2512,y:560};
    let updates=0;
    for(;updates<10000;updates++) {
      nav.update(world,from,target,30);expect(nav.workLastUpdate).toBeLessThanOrEqual(30);
      if(nav.status!=='planning')break;
    }
    expect(updates).toBeGreaterThan(1);expect(nav.status).toBe('following');expect(nav.path.length).toBeLessThan(150);
    for(let i=1;i<nav.path.length;i++)expect(world.canTraverse(nav.path[i-1]!,nav.path[i]!)).toBe(true);
  });
  it('cancels pending work and distinguishes unsupported map bounds from unreachable destinations', () => {
    const world=new CollisionWorld(map,[{cx:300,cy:300,bw:100,bh:200}]),nav=new PlayerNavigation();
    nav.update(world,{x:100,y:300},{x:500,y:300},1);nav.clear();
    expect(nav.status).toBe('idle');expect(nav.path).toEqual([]);
    const large=new CollisionWorld({...map,width:10000,height:10000});
    vi.spyOn(large,'blocked').mockReturnValue(false);vi.spyOn(large,'canTraverse').mockReturnValue(false);
    nav.update(large,{x:100,y:300},{x:500,y:300});expect(nav.status).toBe('failed');expect(nav.failure).toBe('search_limit');
  });
  it.each([0,-1,NaN,Infinity])('does not start unbounded search work for budget %s', budget => {
    const world=new CollisionWorld(map,[{cx:300,cy:300,bw:100,bh:200}]),nav=new PlayerNavigation();
    nav.update(world,{x:100,y:300},{x:500,y:300},budget);expect(nav.workLastUpdate).toBe(0);expect(nav.status).toBe('planning');
  });
  it('routes around an obstacle with full body clearance', () => {
    const world=new CollisionWorld(map,[{cx:300,cy:300,bw:100,bh:200}]),nav=new PlayerNavigation();
    plan(nav,world);expect(nav.status).toBe('following');expect(nav.path.length).toBeGreaterThan(2);
    for(let i=1;i<nav.path.length;i++)expect(world.canTraverse(nav.path[i-1]!,nav.path[i]!)).toBe(true);
    const motion=new PlayerMotion({x:100,y:300});
    for(let i=0;i<300&&nav.status!=='arrived';i++)motion.advance(world,50,1,0,300,from=>nav.waypoint(from));
    expect(motion.position().x).toBeCloseTo(500);expect(motion.position().y).toBeCloseTo(300);expect(nav.status).toBe('arrived');
  });
  it('bounds work, keeps pending searches and replaces a changed target', () => {
    const world=new CollisionWorld(map,[{cx:300,cy:300,bw:100,bh:200}]),nav=new PlayerNavigation();
    nav.update(world,{x:100,y:300},{x:500,y:300},1);expect(nav.status).toBe('planning');
    const generation=nav.generation;nav.update(world,{x:100,y:300},{x:500,y:300},1);expect(nav.generation).toBe(generation);
    nav.update(world,{x:100,y:300},{x:100,y:100});expect(nav.generation).toBe(generation+1);expect(nav.path.at(-1)).toEqual({x:100,y:100});
  });
  it('replans when a server correction crosses to another side of an obstacle', () => {
    const world=new CollisionWorld(map,[{cx:300,cy:300,bw:100,bh:200}]),nav=new PlayerNavigation();
    plan(nav,world);const generation=nav.generation;
    nav.update(world,{x:400,y:300},{x:500,y:300});
    expect(nav.generation).toBe(generation+1);expect(nav.status).toBe('following');
    expect(world.canTraverse({x:400,y:300},nav.waypoint({x:400,y:300})!)).toBe(true);
  });
  it('reports an unreachable destination and replans after geometry changes', () => {
    const nav=new PlayerNavigation(),closed=new CollisionWorld(map,[{cx:300,cy:320,bw:40,bh:640}]);
    plan(nav,closed);expect(nav.status).toBe('failed');expect(nav.path).toEqual([]);
    plan(nav,new CollisionWorld(map));expect(nav.status).toBe('following');
  });
  it('allows a narrow foot passage and rejects the larger mounted body', () => {
    const boxes=[{cx:300,cy:141,bw:40,bh:282},{cx:300,cy:479,bw:40,bh:322}];
    const foot=new CollisionWorld(map,boxes,14),horse=new CollisionWorld(map,boxes,20);
    const nav=new PlayerNavigation();plan(nav,foot);expect(nav.status).toBe('following');
    plan(nav,horse);expect(nav.status).toBe('failed');
  });
  it('projects only a blocked destination, without truncating at an intervening wall', () => {
    const world=new CollisionWorld(map,[{cx:300,cy:300,bw:100,bh:200}]);
    expect(resolvePlayerDestination(world,{x:500,y:300})).toEqual({x:500,y:300});
    const projected=resolvePlayerDestination(world,{x:300,y:300})!;expect(world.blocked(projected.x,projected.y)).toBe(false);
    expect(resolvePlayerDestination(world,{x:NaN,y:300})).toBeNull();
  });
});
