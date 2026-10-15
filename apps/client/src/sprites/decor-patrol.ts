import { cityCrowd } from '../game/systems/city-crowd.js';
import { CityActorAnimation } from './city-actor-animation.js';
import type Phaser from 'phaser';
import { CityRouteFollower, type CityPoint } from '../game/systems/city-route-follower.js';
import { CityUpdateClock } from '../game/systems/city-update-clock.js';
import { resolveNpcAnchor } from './npc-anchor.js';
import { buildNpcRoute } from './npc-pathing.js';
import { isInsidePropAabb, propCollisionRevision } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';
import { entityDepth, syncEntityShadow } from './visual-polish.js';

export function bindDecorPatrol(scene: Phaser.Scene, actor: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle,
  authored: readonly CityPoint[], speed: number, enabled: () => boolean, afterMove?: () => void, registeredCrowdId?: string): void {
  const points=authored.map(p=>resolveNpcAnchor(scene,p.x,p.y)).filter(p=>p!==null);
  let index=0,waitMs=0;
  const sprite=actor as Phaser.GameObjects.Sprite;
  const animation=sprite.texture?new CityActorAnimation(String(sprite.frame.name).replace(/-(?:up-)?\d+$/,'')):null;
  const crowd=cityCrowd(scene),id=registeredCrowdId??`decor:${authored[0]?.x}:${authored[0]?.y}`;
  const release=registeredCrowdId?()=>{}:crowd.register(id,()=>({x:actor.x,y:actor.y,active:actor.active&&actor.visible}));
  const walkable=(p:CityPoint)=>!isInsidePropAabb(scene,p.x,p.y,13)&&!isTileBlockedAt(scene,p.x,p.y);
  const clock=new CityUpdateClock();
  const motion=new CityRouteFollower({
    position:()=>({x:actor.x,y:actor.y}),
    move:point=>actor.setPosition(point.x,point.y),
    route:(from,to)=>buildNpcRoute(scene,from.x,from.y,to.x,to.y,1),
    revision:()=>propCollisionRevision(scene),
    walkable,
    constrainStep:(from,to)=>crowd.step(id,from,to,scene.game.loop.frame,walkable),
  });
  const update=(_time:number,delta:number)=>{
    const elapsed=clock.take(actor,delta,32);if(elapsed===null)return;
    if(!enabled()||points.length<2){motion.clear();return;}
    if(waitMs>0){waitMs=Math.max(0,waitMs-elapsed);animation?.update(sprite,0,0,elapsed);return;}
    const before={x:actor.x,y:actor.y};
    motion.setGoal(points[index]!);
    if(motion.step(elapsed,speed)||motion.failures>=3){index=(index+1)%points.length;waitMs=400;motion.clear();}
    animation?.update(sprite,actor.x-before.x,actor.y-before.y,elapsed);
    actor.setDepth(entityDepth(actor.y));syncEntityShadow(actor as Phaser.GameObjects.Sprite);afterMove?.();
  };
  scene.events.on('update',update);
  scene.events.once('shutdown',()=>{scene.events.off('update',update);release();});
}
