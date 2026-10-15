import { describe, expect, it } from 'vitest';
import { CityCrowd, crowdStep } from './city-crowd.js';
import { CityRouteFollower } from './city-route-follower.js';

describe('bounded city crowd movement',()=>{
  it('checks the entire movement segment against thin obstacles',()=>{
    const point=crowdStep('a',{x:0,y:0},{x:8,y:0},[],p=>p.x<3||p.x>5);
    expect(point===null||point.x<3).toBe(true);
  });
  it('keeps a waiting resident fixed while another walks around it',()=>{
    const obstacle={id:'waiting',x:0,y:0,radius:12};
    let from={x:-30,y:0};
    for(let i=0;i<40;i++){
      const delta={x:50-from.x,y:-from.y},dist=Math.hypot(delta.x,delta.y);
      const point=crowdStep('walker',from,{x:from.x+delta.x/dist*3,y:from.y+delta.y/dist*3},[obstacle],()=>true);
      if(point){expect(Math.hypot(point.x-from.x,point.y-from.y)).toBeLessThanOrEqual(3.00001);from=point;}
      expect(Math.hypot(from.x,from.y)).toBeGreaterThanOrEqual(23.99);
    }
    expect(from.x).toBeGreaterThan(20);
    expect(obstacle).toEqual({id:'waiting',x:0,y:0,radius:12});
  });
  it.each([30,60,144])('lets opposing walkers pass without teleporting at %i FPS',fps=>{
    const poses=[{x:-70,y:0},{x:70,y:0}];
    const crowd=new CityCrowd();
    for(let i=0;i<2;i++)crowd.register(String(i),()=>({...poses[i]!,active:true}));
    const goals=[{x:70,y:0},{x:-70,y:0}];let frame=0;
    const followers=poses.map((_,i)=>new CityRouteFollower({position:()=>poses[i]!,move:p=>{poses[i]=p;},route:(a,b)=>[a,b],revision:()=>0,walkable:()=>true,
      constrainStep:(a,b)=>crowd.step(String(i),a,b,frame,()=>true)}));
    followers.forEach((f,i)=>f.setGoal(goals[i]!));
    for(;frame<fps*12;frame++){
      const before=poses.map(p=>({...p}));
      followers.forEach(f=>f.step(1000/fps,36));
      poses.forEach((p,i)=>expect(Math.hypot(p.x-before[i]!.x,p.y-before[i]!.y)).toBeLessThanOrEqual(36/fps+0.0001));
      expect(Math.hypot(poses[0]!.x-poses[1]!.x,poses[0]!.y-poses[1]!.y)).toBeGreaterThanOrEqual(23.98);
    }
    poses.forEach((p,i)=>expect(Math.hypot(p.x-goals[i]!.x,p.y-goals[i]!.y)).toBeLessThan(1));
  });
  it('waits in a narrow passage instead of stepping through an occupied point',()=>{
    expect(crowdStep('a',{x:0,y:0},{x:4,y:0},[{id:'b',x:24,y:0,radius:12}],p=>Math.abs(p.y)<0.1)).toBeNull();
  });
  it('unregisters an indoor or destroyed actor',()=>{
    const crowd=new CityCrowd(),release=crowd.register('b',()=>({x:24,y:0,active:true}));
    expect(crowd.step('a',{x:0,y:0},{x:4,y:0},0,p=>Math.abs(p.y)<0.1)).toBeNull();
    release();
    expect(crowd.step('a',{x:0,y:0},{x:4,y:0},0,()=>true)).toEqual({x:4,y:0});
  });
});
