import { describe,expect,it } from 'vitest';
import { CityUpdateClock,advanceStallTimer } from './city-update-clock.js';
import { SpatialNeighbors } from './spatial-neighbors.js';
describe('city update cadence',()=>{
 it.each([30,60,120,144])('preserves actor elapsed time at %s FPS for visible and offscreen updates',fps=>{
  for(const interval of [32,200,500]){
   const clock=new CityUpdateClock(),actor={};let elapsed=0;
   for(let frame=0;frame<fps*6;frame++)elapsed+=clock.take(actor,1000/fps,interval)??0;
   elapsed+=clock.take(actor,0,0)??0;expect(elapsed).toBeCloseTo(6000,5);
  }
 });
 it('does not starve a particular slot and retains its time when it becomes visible',()=>{
  const clock=new CityUpdateClock(),actors=Array.from({length:64},()=>({}));
  for(let frame=0;frame<25;frame++)for(const actor of actors)expect(clock.take(actor,16,500)).toBeNull();
  for(const actor of actors)expect(clock.take(actor,16,0)).toBe(416);
 });
 it.each([30,60,144])('measures blocked time at %s FPS without treating small steps as stalls',fps=>{
  let blocked=0,moving=0;for(let frame=0;frame<fps;frame++){blocked=advanceStallTimer(blocked,0,1000/fps);moving=advanceStallTimer(moving,22/fps,1000/fps);}
  expect(blocked).toBeCloseTo(1000,5);expect(moving).toBe(0);
 });
 it('bounds catch-up after background suspension',()=>{expect(new CityUpdateClock().take({},60000,32)).toBe(500);});
});
describe('crowd spatial neighbors',()=>{
 it('matches a complete distance scan across cell borders and negative coordinates',()=>{
  const points=Array.from({length:200},(_,i)=>({x:(i%20)*19-100,y:Math.floor(i/20)*31-90}));const neighbors=new SpatialNeighbors(points,42);
  for(const point of points)expect(new Set(neighbors.nearby(point,30))).toEqual(new Set(points.filter(other=>other!==point&&(other.x-point.x)**2+(other.y-point.y)**2<900)));
 });
});
