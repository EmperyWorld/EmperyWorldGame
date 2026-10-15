import { PLAYER_COLLISION_RADIUS } from './movement.js';
export interface CollisionBox { cx:number; cy:number; bw:number; bh:number; blocksSight?:boolean }
export interface CollisionMap {
  width:number; height:number; tilewidth:number; tileheight:number;
  layers:Array<{name:string;type?:string;data?:number[]}>;
}
import { WALKABLE_TILE_GIDS as WALKABLE } from './terrain-tiles.js';
/** Shared swept-circle movement. Spatial indexing keeps checks local to the mover. */
export class CollisionWorld {
  private cells = new Map<string,CollisionBox[]>();
  constructor(readonly map: CollisionMap, boxes: readonly CollisionBox[] = [], readonly radius = PLAYER_COLLISION_RADIUS) {
    for (const box of boxes) {
      const {tilewidth:tw,tileheight:th}=map;
      for(let y=Math.floor((box.cy-box.bh/2)/th);y<=Math.floor((box.cy+box.bh/2)/th);y++)
        for(let x=Math.floor((box.cx-box.bw/2)/tw);x<=Math.floor((box.cx+box.bw/2)/tw);x++){
          const key=`${x}:${y}`; const cell=this.cells.get(key)??[];cell.push(box);this.cells.set(key,cell);
        }
    }
  }
  blocked(x:number,y:number,radius=this.radius,mode:'movement'|'sight'='movement'):boolean {
    const m=this.map,tw=m.tilewidth,th=m.tileheight;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x-radius<0||y-radius<0||x+radius>=m.width*tw||y+radius>=m.height*th)return true;
    const ground=m.layers.find(layer=>layer.name==='ground')??m.layers.find(layer=>layer.data);
    const intersects=(box:CollisionBox)=>{
      const px=Math.max(box.cx-box.bw/2,Math.min(x,box.cx+box.bw/2));
      const py=Math.max(box.cy-box.bh/2,Math.min(y,box.cy+box.bh/2));
      return (px-x)**2+(py-y)**2 < radius**2;
    };
    for(let ty=Math.floor((y-radius)/th);ty<=Math.floor((y+radius)/th);ty++)
      for(let tx=Math.floor((x-radius)/tw);tx<=Math.floor((x+radius)/tw);tx++){
        const gid=(ground?.data?.[ty*m.width+tx]??0) & 0x1fffffff;
        if(!WALKABLE.has(gid)&&intersects({cx:(tx+0.5)*tw,cy:(ty+0.5)*th,bw:tw,bh:th}))return true;
        if(this.cells.get(`${tx}:${ty}`)?.some(box => (mode !== 'sight' || box.blocksSight !== false) && intersects(box)))return true;
      }
    return false;
  }
  move(from:{x:number;y:number},dx:number,dy:number,speed:number,dtSec:number):{x:number;y:number} {
    const length=Math.hypot(dx,dy);
    if(!length||!Number.isFinite(length)||!Number.isFinite(speed)||!Number.isFinite(dtSec))return {...from};
    const distance=Math.max(0,speed)*Math.max(0,dtSec)*Math.min(1,length);
    const steps=Math.max(1,Math.ceil(distance/4));
    const sx=dx/length*distance/steps,sy=dy/length*distance/steps;
    let {x,y}=from;
    for(let i=0;i<steps;i++){
      if(!this.blocked(x+sx,y))x+=sx;
      if(!this.blocked(x,y+sy))y+=sy;
    }
    return {x,y};
  }
  hasLineOfSight(from:{x:number;y:number},to:{x:number;y:number}):boolean {
    return this.canTraverse(from,to,1,'sight');
  }
  /** Full-body clearance for navigation; combat visibility uses radius 1. */
  canTraverse(from:{x:number;y:number},to:{x:number;y:number},radius=this.radius,mode:'movement'|'sight'='movement'):boolean {
    const distance=Math.hypot(to.x-from.x,to.y-from.y);
    if(!Number.isFinite(distance))return false;
    const steps=Math.max(1,Math.ceil(distance/4));
    for(let i=0;i<=steps;i++)if(this.blocked(from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps,radius,mode))return false;
    return true;
  }
  nearestWalkable(point:{x:number;y:number}):{x:number;y:number} {
    if(!this.blocked(point.x,point.y))return point;
    const {tilewidth:tw,tileheight:th}=this.map;
    const tx=Math.floor(point.x/tw),ty=Math.floor(point.y/th);
    // Explicit bounded search, also handles legacy saves inside walls/props.
    for(let r=1;r<=Math.max(this.map.width,this.map.height);r++){
      let best:{x:number;y:number}|undefined;let d=Infinity;
      for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
        if(Math.max(Math.abs(ox),Math.abs(oy))!==r)continue;
        const x=(tx+ox+0.5)*tw,y=(ty+oy+0.5)*th;
        const distance=Math.hypot(x-point.x,y-point.y);
        if(distance<d&&!this.blocked(x,y)){best={x,y};d=distance;}
      }
      if(best)return best;
    }
    throw new Error('Map has no walkable spawn');
  }
}
