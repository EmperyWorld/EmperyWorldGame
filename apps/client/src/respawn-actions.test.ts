// @vitest-environment happy-dom
import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./api.js',()=>({respawnSave:vi.fn(),fetchSave:vi.fn(),fetchStats:vi.fn(),fetchLocation:vi.fn()}));
vi.mock('./game/game-loader.js',()=>({getGameScene:()=>({respawnPlayer:revive})}));
const {revive}=vi.hoisted(()=>({revive:vi.fn()}));
import {respawnSave,fetchSave,fetchStats,fetchLocation,type PlayerSave,type PlayerStats} from './api.js';
import {createRespawnActions} from './respawn-actions.js';
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
function fixture(){
 let save={id:'hero',location:'origin',hp:0,revision:1} as PlayerSave;
 let loc={id:'origin'};const game={};
 const deps={getSave:()=>save,setSave:vi.fn((s:PlayerSave)=>{save=s;}),getStats:()=>({} as PlayerStats),setStats:vi.fn(),getGame:()=>game,getLocation:()=>loc,setLocation:vi.fn((l:{id:string})=>{loc=l;}),toGameLocation:(l:unknown)=>l,updateHud:vi.fn(),showToast:vi.fn(),syncUiBlocked:vi.fn(),deathScreen:document.getElementById('death-screen')!,transitionLocation:vi.fn()};
 const result=()=>({save:{...save,hp:100,worldX:300,worldY:400,revision:2},stats:{} as PlayerStats});
 vi.mocked(respawnSave).mockImplementation(async()=>result());vi.mocked(fetchSave).mockImplementation(async()=>result().save);vi.mocked(fetchStats).mockResolvedValue({} as PlayerStats);
 return {deps,actions:createRespawnActions(deps as never),result,set:(patch:Partial<PlayerSave>)=>{save={...save,...patch};}};
}
beforeEach(()=>{vi.resetAllMocks();document.body.innerHTML='<div id="death-screen" class="visible"></div><button id="respawn-btn"></button>';});
describe('respawn action lifecycle',()=>{
 it('shares one pending respawn and marks its button busy',async()=>{
  const f=fixture(),reply=deferred<Awaited<ReturnType<typeof respawnSave>>>();vi.mocked(respawnSave).mockReturnValueOnce(reply.promise);
  const first=f.actions.handleRespawn();await f.actions.handleRespawn();expect(respawnSave).toHaveBeenCalledTimes(1);expect(document.querySelector('button')!.disabled).toBe(true);
  reply.resolve(f.result());await first;expect(revive).toHaveBeenCalledWith(expect.objectContaining({worldX:300,worldY:400}),expect.anything());expect(document.querySelector('button')!.disabled).toBe(false);
 });
 it.each(['character','location'])('ignores late respawn after changing %s',async change=>{
  const f=fixture(),reply=deferred<Awaited<ReturnType<typeof respawnSave>>>(),result=f.result();vi.mocked(respawnSave).mockReturnValueOnce(reply.promise);
  const pending=f.actions.handleRespawn();f.set(change==='character'?{id:'other'}:{location:'other'});reply.resolve(result);await pending;expect(f.deps.setSave).not.toHaveBeenCalled();expect(revive).not.toHaveBeenCalled();
 });
 it('does not treat a stale allied resurrection event as a successful revival',async()=>{
  const f=fixture();vi.mocked(fetchSave).mockResolvedValueOnce({id:'hero',hp:0,location:'origin',revision:3} as PlayerSave);
  await f.actions.applyAllyResurrection({targetSaveId:'hero',casterName:'Ally'});expect(revive).not.toHaveBeenCalled();expect(f.deps.deathScreen.classList.contains('visible')).toBe(true);
 });
 it('lets an allied resurrection supersede a pending manual request',async()=>{
  const f=fixture(),reply=deferred<Awaited<ReturnType<typeof respawnSave>>>(),old=f.result();vi.mocked(respawnSave).mockReturnValueOnce(reply.promise);
  const pending=f.actions.handleRespawn();await f.actions.applyAllyResurrection({targetSaveId:'hero',casterName:'Ally'});reply.resolve(old);await pending;
  expect(revive).toHaveBeenCalledTimes(1);expect(f.deps.setSave).toHaveBeenCalledTimes(1);
 });
 it('transitions to the authoritative map if resurrection reconciliation finds a relocation',async()=>{
  const f=fixture();vi.mocked(fetchSave).mockResolvedValueOnce({...f.result().save,location:'town'});vi.mocked(fetchLocation).mockResolvedValueOnce({id:'town'} as never);
  await f.actions.applyAllyResurrection({targetSaveId:'hero',casterName:'Ally'});expect(f.deps.transitionLocation).toHaveBeenCalledTimes(1);expect(revive).not.toHaveBeenCalled();
 });
 it('recovers a committed respawn when its HTTP response was lost',async()=>{
  const f=fixture();vi.mocked(respawnSave).mockRejectedValueOnce(new Error('Lost response'));vi.mocked(fetchLocation).mockResolvedValueOnce({id:'origin'} as never);
  await f.actions.handleRespawn();expect(revive).toHaveBeenCalledTimes(1);expect(f.deps.deathScreen.classList.contains('visible')).toBe(false);
 });

});
