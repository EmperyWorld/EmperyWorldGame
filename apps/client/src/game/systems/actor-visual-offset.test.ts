import { describe, expect, it } from 'vitest';
import { ActorVisualOffset } from './actor-visual-offset.js';
describe('actor visual offsets',()=>{
  it('combines breathing and applause without moving the world anchor',()=>{
    const actor={x:100,y:200,displayOriginX:24,displayOriginY:26.4,scaleX:2,scaleY:2,
      setDisplayOrigin(x:number,y:number){this.displayOriginX=x;this.displayOriginY=y;}};
    const offset=new ActorVisualOffset(actor);
    offset.set('breathing',0,-5);offset.set('applause',0,-6);
    expect(actor.x).toBe(100);expect(actor.y).toBe(200);
    expect(actor.displayOriginY).toBeCloseTo(31.9);
    offset.set('applause',0,0);expect(actor.displayOriginY).toBeCloseTo(28.9);
    offset.clear();expect(actor.displayOriginY).toBeCloseTo(26.4);
  });
});
