import {describe,expect,it,vi} from 'vitest';
vi.mock('phaser',()=>({default:{}}));
import {CombatSystem} from './CombatSystem.js';
import {RemotePlayerManager} from '../systems/RemotePlayerManager.js';
function fixture(){
 const delayed:Array<()=>void>=[];
 const scene={time:{now:1000,delayedCall:(_ms:number,callback:()=>void)=>{delayed.push(callback);}},sys:{isActive:()=>true},registry:{get:()=>new Set(['ally'])}};
 const player={x:100,y:100,isDead:false,isMoving:false,isDashing:false,beginAttack:vi.fn(),endAttack:vi.fn(),hasLineOfSight:()=>true,getFacingRight:()=>true,consumeChargeHitRequest:vi.fn(()=>true),canAttack:()=>false};
 const input={isUiBlocked:vi.fn(()=>false)},network={getGeneration:()=>1,batchAttack:vi.fn().mockResolvedValue(null),mountCharge:vi.fn().mockResolvedValue(null)};
 const entities={findNearestInRange:vi.fn(()=>null),collectInRange:()=>[],countNearby:()=>0};
 const callbacks={onPvpAttack:vi.fn(),onAllyCast:vi.fn(),resolveAllyCastTarget:()=>({saveId:'self',x:100,y:100})};
 const vfx={slash:vi.fn(),sparks:vi.fn(),magicBolt:vi.fn()};
 const remotes=Object.create(RemotePlayerManager.prototype);
 remotes.players=new Map([['ally',{target:{saveId:'ally',hp:100},sprite:{x:105,y:100}}],['enemy',{target:{saveId:'enemy',hp:100},sprite:{x:120,y:100}}]]);
 const combat=new CombatSystem(scene as never,input as never,player as never,entities as never,network as never,vfx as never,callbacks,remotes);
 const internal=combat as unknown as {performAttack:(s:unknown,t:unknown,l:unknown,k:unknown,p:boolean)=>Promise<void>;performAllyCast:(s:unknown,t:unknown,k:string)=>Promise<void>};
 return {combat,internal,player,input,network,callbacks,remotes,delayed};
}
describe('combat intent resolution',()=>{
 it('selects the hostile player beyond a nearer party member',async()=>{
  const f=fixture(),pending=f.internal.performAttack({}, {attackRange:100}, {},undefined,true);f.delayed.shift()!();await pending;
  expect(f.callbacks.onPvpAttack).toHaveBeenCalledWith('enemy',undefined);expect(f.network.batchAttack).not.toHaveBeenCalled();
 });
 it.each(['dead','ui'])('cancels an attack when %s changes during windup',async state=>{
  const f=fixture(),pending=f.internal.performAttack({}, {attackRange:100}, {},undefined,true);
  if(state==='dead')f.player.isDead=true;else f.input.isUiBlocked.mockReturnValue(true);
  f.delayed.shift()!();await pending;
  expect(f.callbacks.onPvpAttack).not.toHaveBeenCalled();expect(f.network.batchAttack).not.toHaveBeenCalled();expect(f.player.endAttack).toHaveBeenCalled();
 });
 it.each(['dead','ui'])('cancels an allied cast when %s changes during windup',async state=>{
  const f=fixture(),pending=f.internal.performAllyCast({}, {attackRange:100},'heal');
  if(state==='dead')f.player.isDead=true;else f.input.isUiBlocked.mockReturnValue(true);
  f.delayed.shift()!();await pending;expect(f.callbacks.onAllyCast).not.toHaveBeenCalled();
 });
 it.each(['dead','ui'])('discards a queued charge while %s blocks combat',state=>{
  const f=fixture();if(state==='dead')f.player.isDead=true;else f.input.isUiBlocked.mockReturnValue(true);
  f.combat.update({} as never,{} as never,{} as never);
  expect(f.player.consumeChargeHitRequest).toHaveBeenCalledTimes(1);expect(f.network.mountCharge).not.toHaveBeenCalled();
 });
 it('does not let dead, allied or occluded players mask a valid target',()=>{
  const f=fixture();f.remotes.players.set('dead',{target:{saveId:'dead',hp:0},sprite:{x:101,y:100}});
  expect(f.remotes.nearestInRange(100,100,100,()=>true,new Set(['ally']))?.presence.saveId).toBe('enemy');
  expect(f.remotes.nearestInRange(100,100,100,x=>x<120,new Set(['ally']))).toBeNull();
 });
 it('selects a visible fallen ally instead of one behind a wall',()=>{
  const f=fixture();f.remotes.players=new Map([['blocked',{target:{saveId:'blocked',hp:0},sprite:{x:110,y:100}}],['visible',{target:{saveId:'visible',hp:0},sprite:{x:130,y:100}}]]);
  expect(f.remotes.nearestDeadInRange(100,100,72,(x:number)=>x!==110)?.presence.saveId).toBe('visible');
  expect(f.remotes.nearestDeadInRange(100,100,72,()=>false)).toBeNull();
 });

});
