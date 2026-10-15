import type Phaser from 'phaser';
import { HAVEN_NPC_POSTS, HAVEN_STAGE_ACTOR_COUNT, havenStageSeat } from '@empery/shared';
import { resolveNpcAnchor } from './npc-anchor.js';
import { isInsidePropAabb } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';

const reservations=new WeakMap<Phaser.Scene,Array<{x:number;y:number}>>();
/** Decorative actors keep clear of named posts, theatre seats and one another. */
export function resolveDecorAnchor(scene:Phaser.Scene,x:number,y:number):{x:number;y:number}|null {
  let occupied=reservations.get(scene);
  if(!occupied){
    occupied=[...HAVEN_NPC_POSTS.map(p=>({x:p.postX,y:p.postY})),...Array.from({length:HAVEN_STAGE_ACTOR_COUNT},(_,i)=>havenStageSeat(i))];
    reservations.set(scene,occupied);scene.events.once('shutdown',()=>reservations.delete(scene));
  }
  // Projection can move a candidate far from its authored point. Check every
  // reservation against the resolved candidate, not an earlier search radius.
  const clear=(p:{x:number;y:number})=>occupied.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=36)&&!isInsidePropAabb(scene,p.x,p.y,16)&&!isTileBlockedAt(scene,p.x,p.y);
  const base=resolveNpcAnchor(scene,x,y);
  if(!base)return null;
  if(clear(base)){occupied.push(base);return base;}
  for(let radius=8;radius<=128;radius+=8){
    let best:{x:number;y:number}|null=null,distance=Infinity;
    for(let dy=-radius;dy<=radius;dy+=8)for(let dx=-radius;dx<=radius;dx+=8){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
      const p={x:base.x+dx,y:base.y+dy},d=dx*dx+dy*dy;
      if(d<distance&&clear(p)){best=p;distance=d;}
    }
    if(best){occupied.push(best);return best;}
  }
  return null;
}
