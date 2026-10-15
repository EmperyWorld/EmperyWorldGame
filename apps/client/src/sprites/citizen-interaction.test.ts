import {describe,expect,it} from 'vitest';
import {CitizenTalkSelection,type TalkCitizen} from './citizen-interaction.js';
import {CollisionWorld} from '@empery/shared/world-collision';
const citizen=(slot:number,x:number,y:number):TalkCitizen=>({slotIndex:slot,districtNpcId:'haven_citizen_market',districtLabel:'Житель',asleep:false,homeTransition:'none',sprite:{x,y,active:true,visible:true,alpha:1}});
describe('citizen interaction identity and availability',()=>{
 it('selects a visible resident instead of a nearer one behind a wall',()=>{
  const world=new CollisionWorld({width:10,height:10,tilewidth:64,tileheight:64,layers:[{name:'ground',data:Array(100).fill(1)}]},[{cx:300,cy:300,bw:10,bh:80}]);
  const hidden=citizen(1,325,300),visible=citizen(2,275,360),selection=new CitizenTalkSelection();
  const canSee=(x:number,y:number)=>world.hasLineOfSight({x:275,y:300},{x,y});
  expect(selection.select([hidden,visible],{x:275,y:300},72,canSee)).toBe(visible);
  expect(selection.resolve([hidden,visible],visible.districtNpcId,{x:275,y:300},canSee)).toBe(visible);
 });
 it('preserves the chosen actor when another resident becomes closer during dialogue handoff',()=>{
  const a=citizen(1,130,100),b=citizen(2,150,100),selection=new CitizenTalkSelection();
  expect(selection.select([a,b],{x:100,y:100},72,()=>true)).toBe(a);b.sprite.x=105;
  expect(selection.resolve([a,b],a.districtNpcId,{x:100,y:100},()=>true)).toBe(a);
 });
 it.each(['inactive','hidden','fading','asleep','entering','distant','occluded'])('does not pause another actor when selected resident becomes %s',state=>{
  const a=citizen(1,130,100),b=citizen(2,150,100),selection=new CitizenTalkSelection();
  selection.select([a,b],{x:100,y:100},72,()=>true);
  if(state==='inactive')a.sprite.active=false;if(state==='hidden')a.sprite.visible=false;if(state==='fading')a.sprite.alpha=0.1;if(state==='asleep')a.asleep=true;if(state==='entering')a.homeTransition='entering';if(state==='distant')a.sprite.x=200;
  expect(selection.resolve([a,b],a.districtNpcId,{x:100,y:100},x=>state!=='occluded'||x!==130)).toBeNull();
 });
 it('rejects explicit slots when asleep or outside talking range',()=>{
  const a=citizen(1,200,100),selection=new CitizenTalkSelection();
  expect(selection.resolve([a],1,{x:100,y:100},()=>true)).toBeNull();a.sprite.x=120;a.asleep=true;
  expect(selection.resolve([a],1,{x:100,y:100},()=>true)).toBeNull();
 });
});
