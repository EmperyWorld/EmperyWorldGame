import { describe,expect,it } from 'vitest';
import { HAVEN_GARRISON_LAYOUT as layout,HAVEN_GARRISON_PROPS,HAVEN_GARRISON_SOLDIERS,HAVEN_GARRISON_GATES,HAVEN_GARRISON_FENCE } from '@empery/shared';
import { worldProps,propCollisionBoxes } from '@empery/shared/world-props';
import { havenScene } from './haven-navigation.test-fixture.js';
import { buildNpcRoute } from './npc-pathing.js';
import { isInsidePropAabb } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';

describe('garrison physical layout',()=>{
  it('has a solid perimeter and mounted-width openings',()=>{
    const boxes=HAVEN_GARRISON_FENCE.flatMap(([id,x,y,size])=>propCollisionBoxes(id,x,y,size));
    expect(boxes).toHaveLength(8);
    for(const gate of HAVEN_GARRISON_GATES){
      expect(boxes.some(b=>Math.abs(gate.x-b.cx)<b.bw/2+14&&Math.abs(gate.y-b.cy)<b.bh/2+14)).toBe(false);
    }
    expect(HAVEN_GARRISON_SOLDIERS.length).toBeGreaterThanOrEqual(30);
  });
  it('uses the same garrison props for client and server collisions',()=>{
    const props=worldProps('empery_haven');
    for(const prop of HAVEN_GARRISON_PROPS)expect(props).toContainEqual(prop);
  });
  it('does not run the palisade through the existing solid scenery',()=>{
    const fences=HAVEN_GARRISON_FENCE.flatMap(([id,x,y,size])=>propCollisionBoxes(id,x,y,size));
    const overlaps:string[]=[];
    for(const [id,x,y,size] of worldProps('empery_haven')){
      if(id.startsWith('prop_garrison_fence'))continue;
      if(propCollisionBoxes(id,x,y,size,true).some(b=>fences.some(f=>Math.abs(b.cx-f.cx)<(b.bw+f.bw)/2&&Math.abs(b.cy-f.cy)<(b.bh+f.bh)/2)))overlaps.push(`${id}@${x},${y}`);
    }
    expect(overlaps).toEqual([]);
  });
  it.each([true,false])('keeps jobs, door and patrols reachable with gatesOpen=%s',gatesOpen=>{
    const scene=havenScene(gatesOpen),failures:string[]=[];
    const positions=[layout.entrance,...layout.sitters,...layout.fencing,layout.archer,...layout.patrol,...HAVEN_GARRISON_SOLDIERS.map(s=>s.post),...HAVEN_GARRISON_GATES];
    for(const p of positions){if(isInsidePropAabb(scene,p.x,p.y,13)||isTileBlockedAt(scene,p.x,p.y))failures.push(`blocked ${p.x},${p.y}`);}
    const routes=[...positions.map(p=>[layout.entrance,p] as const),...layout.patrol.map((p,i)=>[p,layout.patrol[(i+1)%layout.patrol.length]!] as const)];
    for(const [from,to] of routes){const route=buildNpcRoute(scene,from.x,from.y,to.x,to.y,1);if(!route.length)failures.push(`no route ${from.x},${from.y} -> ${to.x},${to.y}`);}
    expect(failures).toEqual([]);
  });
});
