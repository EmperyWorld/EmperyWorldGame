import { describe,expect,it,vi } from 'vitest';
vi.mock('./npc-pathing.js',()=>({buildNpcRoute:(_scene:unknown,x:number,y:number,tx:number,ty:number)=>[{x,y},{x:tx,y:ty}]}));
vi.mock('./prop-colliders.js',()=>({isInsidePropAabb:()=>false,propCollisionRevision:()=>0}));
vi.mock('./world-tiles.js',()=>({isTileBlockedAt:()=>false}));
vi.mock('./visual-polish.js',()=>({entityDepth:(y:number)=>y,syncEntityShadow:vi.fn()}));
import { bindDecorShift } from './decor-shift.js';

function fixture(){
  let active=true;
  const listeners: Array<(_time:number,delta:number)=>void>=[];
  const scene={events:{on:(_event:string,fn:(_time:number,delta:number)=>void)=>listeners.push(fn),once:vi.fn(),off:vi.fn()},game:{loop:{frame:0}}};
  const actor={x:100,y:100,active:true,visible:true,frame:{name:'npc-town_guard-0'},texture:{has:()=>true},anims:{isPlaying:false,stop:vi.fn()},
    setPosition(x:number,y:number){this.x=x;this.y=y;},setVisible(v:boolean){this.visible=v;},setAngle:vi.fn(),setDepth:vi.fn(),setFrame:vi.fn(),setFlipX:vi.fn()};
  const shift=bindDecorShift(scene as unknown as Phaser.Scene,actor as unknown as Phaser.GameObjects.Sprite,'guard',{x:100,y:100},{x:300,y:100},()=>active,1000);
  const advance=(seconds:number)=>{for(let i=0;i<seconds*30;i++){scene.game.loop.frame++;for(const fn of listeners)fn(0,1000/30);}};
  return {actor,shift,advance,setActive:(v:boolean)=>{active=v;}};
}
describe('physical decorative shifts',()=>{
  it('returns a guard through the entrance before hiding and staggers the next departure',()=>{
    const f=fixture();f.advance(.1);expect(f.shift.atPost).toBe(true);
    f.setActive(false);f.advance(.5);expect(f.actor.visible).toBe(true);expect(f.actor.x).toBe(100);
    f.advance(1);expect(f.actor.x).toBeGreaterThan(100);expect(f.actor.x).toBeLessThan(160);
    f.advance(8);expect(f.shift.indoors).toBe(true);expect(f.actor.visible).toBe(false);
    f.setActive(true);f.advance(.5);expect(f.actor.visible).toBe(false);
    f.advance(8);expect(f.shift.atPost).toBe(true);expect(f.actor.visible).toBe(true);expect(f.actor.x).toBeLessThanOrEqual(106);
  });
  it('does not pull a guard back to its starting point during a patrol',()=>{
    const f=fixture();f.advance(.1);f.actor.x=200;f.advance(1);
    expect(f.actor.x).toBe(200);expect(f.shift.atPost).toBe(true);
  });
});
