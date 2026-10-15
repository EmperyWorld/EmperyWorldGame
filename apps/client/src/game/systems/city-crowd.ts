import { SpatialNeighbors } from './spatial-neighbors.js';
import type { CityPoint } from './city-route-follower.js';

export interface CrowdActor extends CityPoint { id: string; radius: number }
export interface CrowdPose extends CityPoint { active: boolean; radius?: number }

/** A bounded step, never a post-update push. Occupied or narrow passages wait. */
export function crowdStep(id: string, from: CityPoint, desired: CityPoint,
  neighbors: readonly CrowdActor[], walkable: (point: CityPoint) => boolean, radius = 12): CityPoint | null {
  const dx = desired.x - from.x, dy = desired.y - from.y, distance = Math.hypot(dx, dy);
  if (distance < 0.001) return from;
  const safe = (point: CityPoint) => {
    const sx = point.x - from.x, sy = point.y - from.y, lengthSq = sx * sx + sy * sy;
    const samples = Math.max(1, Math.ceil(Math.sqrt(lengthSq) / 2));
    for (let i = 1; i <= samples; i++) {
      if (!walkable({x:from.x+sx*i/samples,y:from.y+sy*i/samples})) return false;
    }
    return neighbors.every(other => {
      if (other.id === id) return true;
      const initial = Math.hypot(from.x-other.x,from.y-other.y), clearance = radius + other.radius;
      const final = Math.hypot(point.x-other.x,point.y-other.y);
      // A join may start overlapped; allow a gradual escape, never a teleport.
      if (initial < clearance - 0.01) return final > initial + 0.001;
      const t = lengthSq ? Math.max(0,Math.min(1,((other.x-from.x)*sx+(other.y-from.y)*sy)/lengthSq)) : 0;
      return Math.hypot(from.x+sx*t-other.x,from.y+sy*t-other.y) >= clearance - 0.01;
    });
  };
  if (safe(desired)) return desired;
  // Opposing walkers keep to their own right. Every alternative uses the same budget.
  for (const angle of [Math.PI/4,Math.PI/2,-Math.PI/4,-Math.PI/2]) {
    const cos=Math.cos(angle),sin=Math.sin(angle);
    const point={x:from.x+dx*cos-dy*sin,y:from.y+dx*sin+dy*cos};
    if(safe(point)) return point;
  }
  return null;
}

/** Shared registry for residents, service NPCs and theatre actors in one scene. */
export class CityCrowd {
  private actors = new Map<string, () => CrowdPose>();
  private frame: number | null = null;
  private neighbors = new SpatialNeighbors<CrowdActor>([],64);
  private indexedActors = new Map<string,CrowdActor>();
  register(id: string, pose: () => CrowdPose): () => void {
    this.actors.set(id,pose);this.frame=null;
    return () => { if(this.actors.get(id)===pose)this.actors.delete(id);this.frame=null; };
  }
  step(id: string, from: CityPoint, desired: CityPoint, frame: number, walkable: (p: CityPoint)=>boolean): CityPoint|null {
    if(this.frame!==frame){
      this.frame=frame;
      const points: CrowdActor[]=[];
      for(const [key,read] of this.actors){const p=read();if(p.active)points.push({id:key,x:p.x,y:p.y,radius:p.radius??12});}
      this.indexedActors=new Map(points.map(point=>[point.id,point]));
      this.neighbors=new SpatialNeighbors(points,64);
    }
    const nearby=this.neighbors.nearby({id,x:from.x,y:from.y,radius:12},96);
    const next=crowdStep(id,from,desired,nearby,walkable,this.actors.get(id)?.().radius??12);
    const indexed=this.indexedActors.get(id);
    if(next&&indexed){indexed.x=next.x;indexed.y=next.y;}
    return next;
  }
}
const crowds = new WeakMap<object,CityCrowd>();
export function cityCrowd(scene: object): CityCrowd {
  let crowd=crowds.get(scene);if(!crowd){crowd=new CityCrowd();crowds.set(scene,crowd);}return crowd;
}
