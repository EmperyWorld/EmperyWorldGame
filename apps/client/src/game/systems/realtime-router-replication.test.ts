import { describe, expect, it, vi } from 'vitest';
vi.mock('../../sprites/sprite-loader.js',()=>({playHurtFlash:vi.fn()}));
vi.mock('../../death-ui.js',()=>({syncDeathScreen:vi.fn()}));
import { RealtimeRouter, type RealtimeRouterContext } from './RealtimeRouter.js';
import type { MultiplayerEnemyPresence, MultiplayerPlayerPresence } from '../../api.js';
function fixture(){
 const recycleEnemy=vi.fn(),applyRemoteDeath=vi.fn(),applyEnemySnapshot=vi.fn((_enemies:MultiplayerEnemyPresence[])=>[]);
 const players=new Map<string,MultiplayerPlayerPresence>();
 const applyPresence=vi.fn((player:MultiplayerPlayerPresence)=>players.set(player.saveId,player));
 const router=new RealtimeRouter({getLocationId:()=> 'adena_fields',getCallbacks:()=>undefined,
  entities:{isReady:()=>true,applyEnemySnapshot,getByEntityId:()=>({isDying:false}),recycleEnemy},
  network:{getEncounterId:()=> 'enc'},getCombat:()=>({applyRemoteDeath}),
  remotePlayers:{getPresence:(id:string)=>players.get(id),applyPresence,remove:vi.fn()}} as unknown as RealtimeRouterContext);
 return {router,recycleEnemy,applyRemoteDeath,applyEnemySnapshot,players,applyPresence};
}
const enemy={entityId:'e1',type:'wolf',level:1,hp:100,maxHp:100,x:100,y:100,speed:100,facing:'right',moving:false,quest:false,alive:true,control:'pin'} as MultiplayerEnemyPresence;
function baseline(f:ReturnType<typeof fixture>){f.router.handleMessage({type:'enemy_snapshot',payload:{locationId:'adena_fields',encounterId:'enc',enemies:[enemy],generatedAt:1,interestFiltered:true}});}
describe('replication lifecycle on the client',()=>{
 it('unloads an out-of-interest enemy without treating it as a kill',()=>{
  const f=fixture();baseline(f);
  f.router.handleMessage({type:'enemy_delta',payload:{locationId:'adena_fields',encounterId:'enc',added:[],changed:[],removed:['e1'],dead:[]}});
  expect(f.recycleEnemy).toHaveBeenCalledTimes(1);expect(f.applyRemoteDeath).not.toHaveBeenCalled();
  baseline(f);f.router.handleMessage({type:'enemy_delta',payload:{locationId:'adena_fields',encounterId:'enc',added:[],changed:[],removed:[],dead:['e1']}});
  expect(f.applyRemoteDeath).toHaveBeenCalledWith('e1');
 });
 it('clears expired enemy control and disconnected-player metadata',()=>{
  const f=fixture();baseline(f);
  f.router.handleMessage({type:'enemy_delta',payload:{locationId:'adena_fields',encounterId:'enc',added:[],changed:[{entityId:'e1',unset:['control']}],removed:[],dead:[]}});
  expect(f.applyEnemySnapshot.mock.calls.at(-1)?.[0]?.[0]?.control).toBeUndefined();
  f.players.set('p1',{saveId:'p1',disconnectRemainingMs:100,connectionStatus:'disconnected'} as MultiplayerPlayerPresence);
  f.router.handleMessage({type:'presence_delta',payload:{locationId:'adena_fields',added:[],changed:[{saveId:'p1',connectionStatus:'online',unset:['disconnectRemainingMs']}],removed:[]}});
  expect(f.players.get('p1')?.disconnectRemainingMs).toBeUndefined();expect(f.players.get('p1')?.connectionStatus).toBe('online');
 });
});
