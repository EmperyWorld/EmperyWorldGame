import {describe,expect,it,vi} from 'vitest';
vi.mock('phaser',()=>({default:{}}));
import {GroundLootManager} from './ground-loot.js';
import {CollisionWorld} from '@empery/shared/world-collision';
describe('loot interaction selection',()=>{
 it('selects visible loot beyond a nearer pile behind a wall',()=>{
  const world=new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]},[{cx:300,cy:300,bw:10,bh:80}]);
  const manager=Object.create(GroundLootManager.prototype),hidden={id:'hidden',x:325,y:300},visible={id:'visible',x:275,y:370};
  Object.assign(manager,{fetchingIds:new Set(),visuals:new Map([['hidden',{pile:hidden}],['visible',{pile:visible}]])});
  expect(manager.findNearest(275,300,100,(x:number,y:number)=>world.hasLineOfSight({x:275,y:300},{x,y}))).toBe(visible);
  expect(manager.findNearest(275,300,60,(x:number,y:number)=>world.hasLineOfSight({x:275,y:300},{x,y}))).toBeNull();
 });
 it('does not select loot already being carried by a companion',()=>{
  const manager=Object.create(GroundLootManager.prototype);
  Object.assign(manager,{fetchingIds:new Set(['a']),visuals:new Map([['a',{pile:{id:'a',x:100,y:100}}]])});
  expect(manager.findNearest(100,100)).toBeNull();
 });
});
