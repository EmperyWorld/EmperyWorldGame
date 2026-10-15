import { CollisionWorld } from '@empery/shared/world-collision';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPERY_FOUNDERS, EMPERY_RECEPTIONIST_APPEARANCE, EMPERY_HQ_LOBBY, EMPERY_HQ_LOBBY_NPCS } from '@empery/shared';
import { propCollisionBoxes, worldProps } from '@empery/shared/world-props';
import { EMPERY_HQ } from '../../../../scripts/layouts/empery_hq.mjs';
import { NPC_WORLD_CATALOG } from './npc-catalog.js';
import { PROP_COLLIDER_GROUP_KEY, isInsidePropAabb } from './prop-colliders.js';
import { GROUND_LAYER_KEY, isTileBlockedAt } from './world-tiles.js';
import { isWalkableTileGid } from '../game/systems/world-geodata.js';
import { buildNpcRoute } from './npc-pathing.js';

function campusScene(location='empery_hq_lobby'): Phaser.Scene {
  const map = JSON.parse(readFileSync(new URL(`../../public/maps/${location}.json`, import.meta.url), 'utf8'));
  const ground = map.layers.find((l: {name: string}) => l.name === 'ground');
  const at = (tx: number, ty: number) => {
    if(tx<0||ty<0||tx>=map.width||ty>=map.height)return null;
    const index = ground.data[ty*map.width+tx];
    return {index,collides:!isWalkableTileGid(index)};
  };
  const colliders = worldProps(location).flatMap(([id,x,y,size]) => propCollisionBoxes(id,x,y,size))
    .map(b => ({body:{left:b.cx-b.bw/2,right:b.cx+b.bw/2,top:b.cy-b.bh/2,bottom:b.cy+b.bh/2}}));
  const data = new Map<string,unknown>([
    [PROP_COLLIDER_GROUP_KEY,{scene:{},children:{},getLength:()=>colliders.length,getChildren:()=>colliders}],
    [GROUND_LAYER_KEY,{tilemap:{tileWidth:64,tileHeight:64},getTileAt:at,getTileAtWorldXY:(x:number,y:number)=>at(Math.floor(x/64),Math.floor(y/64))}],
  ]);
  return {data,physics:{world:{bounds:{x:0,y:0,right:map.width*64,bottom:map.height*64}}}} as unknown as Phaser.Scene;
}

describe('EmperyWorld authors campus', () => {
  it('has unique named author sprites matching their permanent identities', () => {
    expect(EMPERY_FOUNDERS.map(f=>f.name)).toEqual(['Lady_Boss','po&T']);
    for(const founder of EMPERY_FOUNDERS){
      expect(NPC_WORLD_CATALOG[founder.id]?.appearance).toEqual(founder.appearance);
      expect(EMPERY_HQ_LOBBY_NPCS).toContainEqual({id:founder.id,...founder.post,label:`${founder.name} · автор [E]`});
    }
    expect(EMPERY_FOUNDERS[0]!.appearance.gender).toBe('female');
    expect(EMPERY_FOUNDERS[0]!.appearance.hairStyle).toBe(1);
    expect(EMPERY_FOUNDERS[1]!.appearance.hairStyle).toBe(5);
    expect(EMPERY_FOUNDERS[1]!.appearance.accessory).toBe(0);
    expect(EMPERY_RECEPTIONIST_APPEARANCE.age).toBe(22);
    expect(NPC_WORLD_CATALOG[EMPERY_FOUNDERS[0]!.id]?.seated).toBe(true);
    expect(NPC_WORLD_CATALOG[EMPERY_FOUNDERS[1]!.id]?.prop).toBe('laptop');
    EMPERY_FOUNDERS.forEach((f,i)=>{
      expect(f.post.x).toBe(EMPERY_HQ_LOBBY.sofas[i]!.x);
      expect(f.post.y).toBe(EMPERY_HQ_LOBBY.sofas[i]!.y-26);
    });
  });
  it('separates the indoor reception from outdoor buildings and the unused landing pad', () => {
    const indoor=worldProps('empery_hq_lobby');
    expect(indoor.some(([id])=>['prop_hq_building','prop_hq_lab','prop_hq_pad','prop_hq_fence'].includes(id))).toBe(false);
    expect(worldProps('empery_hq').some(([id])=>['prop_hq_reception_desk','prop_hq_lounge_sofa','prop_hq_pad'].includes(id))).toBe(false);
    const scene=campusScene('empery_hq');
    expect(buildNpcRoute(scene,1312,1696,1312,688,1).length).toBeGreaterThan(1);
  });
  it('keeps walking collision at the low reception counter while allowing a conversation across it', () => {
    const map=JSON.parse(readFileSync(new URL('../../public/maps/empery_hq_lobby.json',import.meta.url),'utf8'));
    const world=new CollisionWorld(map,worldProps('empery_hq_lobby').flatMap(([id,x,y,size])=>propCollisionBoxes(id,x,y,size)));
    const guest={x:640,y:420},receptionist=EMPERY_HQ_LOBBY.reception;
    expect(world.blocked(guest.x,guest.y)).toBe(false);
    expect(world.hasLineOfSight(guest,receptionist)).toBe(true);
    expect(world.canTraverse(guest,receptionist)).toBe(false);
    for(const founder of EMPERY_FOUNDERS){
      const front={x:founder.post.x,y:founder.post.y+64};
      expect(world.hasLineOfSight(front,founder.post)).toBe(true);
      expect(world.blocked(front.x,front.y,13)).toBe(false);
    }
    expect(world.hasLineOfSight({x:32,y:700},{x:160,y:700})).toBe(false);
    expect(EMPERY_HQ.props.some(([id])=>id==='prop_hq_design_table'||id==='prop_hq_engineering_console')).toBe(false);
  });
  it('keeps every NPC accessible from the gate and both studios connected', () => {
    const scene=campusScene(), fail:string[]=[];
    const origin=EMPERY_HQ_LOBBY.spawn;
    const points=[...EMPERY_HQ_LOBBY_NPCS.map(n=>({x:n.x,y:n.y+(NPC_WORLD_CATALOG[n.id]?.seated ? 64 : 0)})),EMPERY_HQ_LOBBY.exit];
    for(const point of [origin,...points]) {
      if(isTileBlockedAt(scene,point.x,point.y)||isInsidePropAabb(scene,point.x,point.y,13))fail.push(`blocked ${point.x},${point.y}`);
      if(!buildNpcRoute(scene,origin.x,origin.y,point.x,point.y,1).length)fail.push(`unreachable ${point.x},${point.y}`);
    }
    const [a,b]=EMPERY_FOUNDERS;
    expect(buildNpcRoute(scene,a!.post.x,a!.post.y+64,b!.post.x,b!.post.y+64,1).length).toBeGreaterThan(1);
    expect(fail).toEqual([]);
  });
});
