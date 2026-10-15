import { describe, expect, it } from 'vitest';
import { PresenceReplication } from './presence-replication.js';
import { EnemyReplication } from './enemy-replication.js';
import type { MultiplayerPlayerPresence, MultiplayerEnemyPresence } from '@empery/shared';
const player={saveId:'p1',name:'Hero',race:'human',profession:'warrior',level:1,locationId:'adena_fields',x:100,y:100,facing:'right',moving:false,hp:100,maxHp:100,karma:0,pvpStatus:'peaceful'} as MultiplayerPlayerPresence;
const enemy={entityId:'e1',type:'wolf',level:1,hp:100,maxHp:100,speed:100,x:200,y:100,quest:false,facing:'right',moving:false,alive:true,control:'pin'} as MultiplayerEnemyPresence;
describe('interest and delta replication',()=>{
 it('sends a baseline, suppresses unchanged state, sends changed fields and clears optional fields',()=>{
  const replica=new PresenceReplication(),snapshot={locationId:player.locationId,players:[player,{...player,saveId:'far',x:10000}],generatedAt:1};
  const initial=replica.message('conn',snapshot,player);expect(initial?.type).toBe('location_snapshot');if(initial?.type!=='location_snapshot')throw new Error('baseline');expect(initial.payload.players).toHaveLength(1);
  expect(replica.message('conn',snapshot,player)).toBeNull();
  const moving={...player,x:110,moving:true,disconnectRemainingMs:100};
  const first=replica.message('conn',{...snapshot,players:[moving]},moving);expect(first?.type).toBe('presence_delta');
  const cleared=replica.message('conn',{...snapshot,players:[player]},player);
  if(cleared?.type!=='presence_delta')throw new Error('delta');expect(cleared.payload.changed[0]?.unset).toEqual(['disconnectRemainingMs']);
  replica.forget('conn');expect(replica.message('conn',snapshot,player)?.type).toBe('location_snapshot');
 });
 it('does not share loot visibility between observers with identical visible players',()=>{
  const replica=new PresenceReplication();
  const other={...player,saveId:'p2',x:1000};
  const pile={id:'loot',locationId:player.locationId,x:2000,y:100,drops:[],owner:{kind:'solo' as const,saveId:player.saveId},ownerUntil:0,expiresAt:100,spawnAt:1};
  const snapshot={locationId:player.locationId,players:[player,other],groundLoot:[pile],generatedAt:1};
  const near=replica.message('near',snapshot,other),far=replica.message('far',snapshot,player);
  if(near?.type!=='location_snapshot'||far?.type!=='location_snapshot')throw new Error('baseline');
  expect(near.payload.groundLoot).toEqual([pile]);expect(far.payload.groundLoot).toEqual([]);
 });
 it('distinguishes enemy death from leaving interest, and expires control through explicit unset',()=>{
  const replica=new EnemyReplication(),snapshot={locationId:player.locationId,encounterId:'enc',enemies:[enemy],generatedAt:1};
  expect(replica.message('conn',snapshot,player)?.type).toBe('enemy_snapshot');expect(replica.message('conn',snapshot,player)).toBeNull();
  const expired=replica.message('conn',{...snapshot,enemies:[{...enemy,control:undefined}]},player);
  if(expired?.type!=='enemy_delta')throw new Error('delta');expect(expired.payload.changed[0]?.unset).toEqual(['control']);
  const out=replica.message('conn',{...snapshot,enemies:[{...enemy,x:10000}]},player);
  if(out?.type!=='enemy_delta')throw new Error('delta');expect(out.payload.removed).toEqual(['e1']);expect(out.payload.dead).toEqual([]);
  replica.message('conn',snapshot,player);
  const killed=replica.message('conn',{...snapshot,enemies:[]},player);
  if(killed?.type!=='enemy_delta')throw new Error('delta');expect(killed.payload.dead).toEqual(['e1']);
 });
});
