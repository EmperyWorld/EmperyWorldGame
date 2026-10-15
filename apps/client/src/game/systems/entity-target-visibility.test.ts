import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Physics: { Arcade: { Sprite: class {} } } } }));
import { EntityManager } from './EntityManager.js';
import { CollisionWorld } from '@empery/shared/world-collision';

describe('combat target visibility', () => {
  it('skips the closest occluded enemy and excludes it from area and auto attack queries', () => {
    const world = new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]},[{cx:300,cy:300,bw:10,bh:80}]);
    const hidden = {active:true,x:325,y:300}, visible = {active:true,x:275,y:370};
    const entities = Object.create(EntityManager.prototype);
    Object.assign(entities,{group:{getChildren:()=>[hidden,visible]},rangeBuffer:[]});
    const canSee = (x:number,y:number) => world.hasLineOfSight({x:275,y:300},{x,y});
    expect(entities.findNearestInRange(275,300,100,canSee)?.entity).toBe(visible);
    expect(entities.collectInRange(275,300,100,canSee)).toEqual([visible]);
    expect(entities.hasEnemyInRange(275,300,60,canSee)).toBe(false);
    expect(entities.hasEnemyInRange(275,300,100,canSee)).toBe(true);
  });
});

describe('station and kiosk visibility',()=>{
  it('uses safe interaction anchors and skips occluded nearest objects',()=>{
    const entities=Object.create(EntityManager.prototype),hidden={kinds:['water'],x:110,y:100},visible={kinds:['campfire'],x:140,y:100};
    Object.assign(entities,{stationPoints:[hidden,visible],stationAnchors:[{x:110,y:100},{x:140,y:100}],cityMapPoints:[{id:'hidden',x:110,y:100},{id:'visible',x:140,y:100}]});
    expect(entities.findUseStation(100,100,110,(x:number)=>x!==110)).toBe(visible);
    expect(entities.findCityMapKiosk(100,100,96,(x:number)=>x!==110)?.id).toBe('visible');
    expect(entities.findUseStation(100,100,110,()=>false)).toBeNull();
    expect(entities.findCityMapKiosk(100,100,96,()=>false)).toBeNull();
  });
  it('does not let a station hidden behind a wall suppress a visible map prompt',()=>{
    const entities=Object.create(EntityManager.prototype),stationLabel={setVisible:vi.fn()},mapLabel={setVisible:vi.fn()};
    Object.assign(entities,{npcMeta:[],stationPoints:[{}],stationAnchors:[{x:110,y:100}],stationLabels:[stationLabel],stationMarkers:[],cityMapPoints:[{x:140,y:100}],cityMapLabels:[mapLabel],cityMapMarkers:[]});
    entities.syncNpcProximityUi(100,100,96,{lineOfSight:(x:number)=>x!==110});
    expect(stationLabel.setVisible).toHaveBeenCalledWith(false);expect(mapLabel.setVisible).toHaveBeenCalledWith(true);
  });
});

describe('live service lantern position',()=>{
 it('uses the visible actor pose and excludes hidden or fading actors',()=>{
  const entities=Object.create(EntityManager.prototype),sprite={x:100,y:200,active:true,visible:true,alpha:1};
  Object.assign(entities,{npcMeta:[{id:'town_guard',sprite}]});
  expect(entities.visibleNpcPosition('town_guard')).toEqual({x:100,y:200});sprite.x=130;
  expect(entities.visibleNpcPosition('town_guard')).toEqual({x:130,y:200});sprite.visible=false;
  expect(entities.visibleNpcPosition('town_guard')).toBeNull();sprite.visible=true;sprite.alpha=0.1;
  expect(entities.visibleNpcPosition('town_guard')).toBeNull();expect(entities.visibleNpcPosition('missing')).toBeNull();
 });
});
