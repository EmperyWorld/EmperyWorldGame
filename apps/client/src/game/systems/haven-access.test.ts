import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '@empery/shared/world-collision';
import { propCollisionBoxes, worldProps } from '@empery/shared/world-props';
import { HAVEN } from '../../../../../scripts/layouts/empery_haven.mjs';

/** Reachability uses the player's actual body, not just the marker's ground tile. */
describe('Haven functional placement access', () => {
  it('connects spawn to every NPC interaction, station and travel trigger', () => {
    const map=JSON.parse(readFileSync(new URL('../../../public/maps/empery_haven.json',import.meta.url),'utf8'));
    const world=new CollisionWorld(map,worldProps('empery_haven',{hqAccess:true,stations:HAVEN.stations}).flatMap(([id,x,y,size])=>propCollisionBoxes(id,x,y,size,true)));
    const [sx,sy]=HAVEN.spawn;
    expect(world.blocked(sx,sy),'authored player spawn').toBe(false);
    const step=32,cols=map.width*map.tilewidth/step,rows=map.height*map.tileheight/step;
    const reached=new Uint8Array(cols*rows),queue:number[]=[Math.round(sy/step)*cols+Math.round(sx/step)];
    reached[queue[0]!]=1;
    const points:Array<{x:number;y:number}>=[];
    for(let cursor=0;cursor<queue.length;cursor++){
      const id=queue[cursor]!,x=id%cols*step,y=Math.floor(id/cols)*step;
      points.push({x,y});
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx!*step,ny=y+dy!*step,nid=Math.round(ny/step)*cols+Math.round(nx/step);
        if(nx<step||ny<step||nx>=cols*step||ny>=rows*step||reached[nid]||world.blocked(nx,ny))continue;
        let clear=true;
        for(let i=1;i<=4;i++)if(world.blocked(x+dx!*step*i/4,y+dy!*step*i/4)){clear=false;break;}
        if(clear){reached[nid]=1;queue.push(nid);}
      }
    }
    const targets=[
      ...HAVEN.npcs.map((npc:{id:string;x:number;y:number})=>({...npc,radius:96})),
      ...HAVEN.stations,
      ...HAVEN.zones.filter((zone:{travelTo?:string})=>zone.travelTo).map((zone:{label:string;radius:number;x:number;y:number})=>({...zone,id:zone.label})),
    ];
    const inaccessible:string[]=[];
    for(const target of targets)if(!points.some(p=>Math.hypot(p.x-target.x,p.y-target.y)<=target.radius))inaccessible.push(target.id);
    expect(inaccessible).toEqual([]);
  });
});
