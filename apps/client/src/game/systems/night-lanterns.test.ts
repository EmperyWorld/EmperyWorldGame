import {describe,expect,it} from 'vitest';
import {selectNightLanterns} from './night-lanterns.js';
const view={x:0,y:0,width:400,height:400};
describe('night lantern selection',()=>{
 it('follows actual actor coordinates and ignores hidden actors instead of using schedule posts',()=>{
  const resolve=(id:string)=>id==='visible'?{x:130,y:140}:null;
  expect(selectNightLanterns([{id:'visible',phase:'patrol'},{id:'hidden',phase:'walking_home'}],resolve,[],view)).toEqual([{x:130,y:140}]);
 });
 it('includes commuting actors but not sleeping or stationary workers',()=>{
  const entries=['walking_home','walking_to_post','patrol','at_home','hidden','at_post'].map((phase,i)=>({id:String(i),phase}));
  const points=selectNightLanterns(entries,id=>({x:100+Number(id)*20,y:100}),[],view);
  expect(points).toHaveLength(3);expect(points.map(p=>p.x).sort((a,b)=>a-b)).toEqual([100,120,140]);
 });
 it('does not let distant off-screen actors consume the visible patrol budget',()=>{
  const entries=Array.from({length:20},(_,i)=>({id:String(i),phase:'patrol'}));
  expect(selectNightLanterns(entries,()=>({x:5000,y:5000}),[{x:200,y:200}],view,4)).toEqual([{x:200,y:200}]);
 });
 it('prioritizes the nearest visible lanterns and keeps the budget bounded',()=>{
  const guards=Array.from({length:20},(_,i)=>({x:20+i*18,y:200}));
  const selected=selectNightLanterns([],()=>null,guards,view,4);
  expect(selected).toHaveLength(4);expect(selected[0]).toEqual({x:200,y:200});
  expect(selectNightLanterns([],()=>null,guards,view,100)).toHaveLength(14);
 });
 it('deduplicates overlapping lanterns and drops non-finite coordinates',()=>{
  expect(selectNightLanterns([{id:'guard',phase:'patrol'}],()=>({x:200,y:200}),[{x:201,y:200},{x:NaN,y:10}],view)).toEqual([{x:200,y:200}]);
 });
});
