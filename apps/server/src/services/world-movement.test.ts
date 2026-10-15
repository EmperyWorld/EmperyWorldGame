import { describe, expect, it } from 'vitest';
import { CollisionWorld, type CollisionMap } from '@empery/shared/world-collision';
import { PlayerAuthority } from './player-authority.js';
import { fileURLToPath } from 'node:url';
import { applyStatsToSave } from './stats.js';
import type { PlayerSave } from '@empery/shared';
function map():CollisionMap{return {width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array.from({length:100},(_,i)=>i%10===5?4:1)}]};}
describe('shared swept movement',()=>{
 it('preserves analog throttle and capped click steps on the authoritative simulation',()=>{
  const world=new CollisionWorld({...map(),layers:[{name:'ground',data:Array(100).fill(1)}]});
  expect(world.move({x:100,y:100},0.25,0,200,.05).x).toBeCloseTo(102.5);
  expect(world.move({x:100,y:100},13/30,0,600,.05).x).toBeCloseTo(113);
 });
 it('prevents tunneling through tiles and props, slides along walls, normalizes diagonals',()=>{
  const world=new CollisionWorld(map(),[{cx:180,cy:128,bw:20,bh:60}]);
  expect(world.hasLineOfSight({x:128,y:128},{x:240,y:128})).toBe(false);
  expect(world.hasLineOfSight({x:64,y:64},{x:128,y:64})).toBe(true);
  const stop=world.move({x:128,y:128},1,0,420,.5);expect(stop.x).toBeLessThanOrEqual(156);
  const wall=world.move({x:280,y:128},1,1,420,.5);expect(wall.x).toBeLessThanOrEqual(306);expect(wall.y).toBeGreaterThan(128);
  const diagonal=new CollisionWorld({...map(),layers:[{name:'ground',data:Array(100).fill(1)}]}).move({x:64,y:64},1,1,100,.05);
  expect(Math.hypot(diagonal.x-64,diagonal.y-64)).toBeCloseTo(5);
 });
 it('bounds command queues and preserves dash cooldown while resetting connection sequence',()=>{
  const save=applyStatsToSave({id:'motion',name:'Hero',race:'human',profession:'warrior',level:1,xp:0,hp:100,maxHp:100,adena:0,location:'adena_fields',inventory:[],equipment:{},skillLevels:{},skillCooldowns:{},questFlags:{},stamina:700,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()} as PlayerSave);
  const service=new PlayerAuthority(fileURLToPath(new URL('../../../client/public/maps',import.meta.url)));
  service.beginSession(save);
  for(let seq=1;seq<=8;seq++)expect(service.enqueue(save,{type:'move_command',seq,locationId:save.location,dx:1,dy:0})).toBe(true);
  expect(service.enqueue(save,{type:'move_command',seq:9,locationId:save.location,dx:1,dy:0})).toBe(false);
  expect(service.enqueue(save,{type:'move_command',seq:1,locationId:save.location,dx:1,dy:0})).toBe(false);
  const charged=service.requestDash(save,1000);expect(charged.started).toBe(true);service.beginSession(charged.save);
  expect(service.requestDash(charged.save,1100).started).toBe(false);
  expect(service.enqueue(save,{type:'move_command',seq:1,locationId:'silverwood',dx:1,dy:0})).toBe(false);
 });
});
