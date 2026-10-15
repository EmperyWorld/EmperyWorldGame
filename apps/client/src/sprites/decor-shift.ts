import type Phaser from 'phaser';
import { CityStageMotion } from '../game/systems/city-stage-motion.js';
import { cityCrowd } from '../game/systems/city-crowd.js';
import { CityUpdateClock } from '../game/systems/city-update-clock.js';
import { CityActorAnimation } from './city-actor-animation.js';
import { buildNpcRoute } from './npc-pathing.js';
import { isInsidePropAabb, propCollisionRevision } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';
import { entityDepth, syncEntityShadow } from './visual-polish.js';
import type { CityPoint } from '../game/systems/city-route-follower.js';

/** Decorative jobs use physical commutes rather than disappearing on a clock edge. */
export function bindDecorShift(scene: Phaser.Scene, actor: Phaser.GameObjects.Sprite|Phaser.GameObjects.Rectangle,
  id: string, post: CityPoint, entrance: CityPoint, enabled: ()=>boolean, departureDelayMs=0) {
  const sprite=actor as Phaser.GameObjects.Sprite;
  const animation=sprite.texture ? new CityActorAnimation(String(sprite.frame.name).replace(/-(?:up-)?\d+$/,'')) : null;
  const crowd=cityCrowd(scene);
  const release=crowd.register(id,()=>({x:actor.x,y:actor.y,active:actor.active&&actor.visible}));
  const walkable=(point: CityPoint)=>!isTileBlockedAt(scene,point.x,point.y)&&!isInsidePropAabb(scene,point.x,point.y,13);
  const motion=new CityStageMotion({position:()=>({x:actor.x,y:actor.y}),move:p=>actor.setPosition(p.x,p.y),
    route:(from,to)=>buildNpcRoute(scene,from.x,from.y,to.x,to.y,1),revision:()=>propCollisionRevision(scene),walkable,
    constrainStep:(from,to)=>crowd.step(id,from,to,scene.game.loop.frame,walkable)},post,entrance);
  let started=false,previous=false,delay=0;
  const clock=new CityUpdateClock();
  const update=(_time:number,delta:number)=>{
    const elapsed=clock.take(actor,delta,32);if(elapsed===null)return;
    const active=enabled();
    if(!started){started=true;previous=active;motion.seed({id,...post,atSeat:active,asleep:!active},!active);}
    if(active!==previous){previous=active;delay=departureDelayMs;}
    if(delay>0){delay=Math.max(0,delay-elapsed);return;}
    if(active&&motion.atSeat)return;
    const before={x:actor.x,y:actor.y};
    motion.update({id,...post,atSeat:active,asleep:!active},!active,elapsed,40);
    actor.setVisible(!motion.asleep);
    if(!motion.atSeat&&!motion.asleep){
      animation?.update(sprite,actor.x-before.x,actor.y-before.y,elapsed);
      actor.setAngle(0);
    }
    actor.setDepth(entityDepth(actor.y));syncEntityShadow(sprite);
  };
  scene.events.on('update',update);
  scene.events.once('shutdown',()=>{scene.events.off('update',update);release();});
  return {get atPost(){return motion.atSeat;},get indoors(){return motion.asleep;}};
}
