// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./api.js', () => ({toggleMount:vi.fn(),dismountMount:vi.fn()}));
vi.mock('./game/game-loader.js', () => ({getGameScene:vi.fn()}));
import { toggleMount, dismountMount, type PlayerSave, type PlayerStats } from './api.js';
import { createMountActions } from './mount-actions.js';

function deferred<T>() {
  let resolve!: (value:T)=>void;
  let reject!: (reason:Error)=>void;
  const promise = new Promise<T>((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
function fixture(mounted=false) {
  let save = {id:'hero',location:'empery_haven',revision:1,mount:{ownedId:'field_horse',mounted}} as PlayerSave;
  const stats = {} as PlayerStats;
  const deps = {getSave:()=>save,setSave:vi.fn((next:PlayerSave)=>{save=next;}),getStats:()=>stats,setStats:vi.fn(),getGame:()=>null,getLocation:()=>({dayNight:'outdoor' as const}),updateHud:vi.fn(),showToast:vi.fn()};
  return {deps,actions:createMountActions(deps),save:()=>save,set:(patch:Partial<PlayerSave>)=>{save={...save,...patch};},result:(mounted:boolean,revision=2)=>({save:{...save,revision,mount:{...save.mount!,mounted}},stats,message:mounted?'Сел на коня':'Спешился',mounted})};
}
beforeEach(()=>{vi.clearAllMocks();document.body.innerHTML='<button id="action-mount"><span id="action-mount-label"></span></button>';});

describe('mount transition coordination', () => {
  it('ignores repeated H while a transition is pending and exposes busy state', async()=>{
    const f=fixture(),request=deferred<Awaited<ReturnType<typeof toggleMount>>>();
    vi.mocked(toggleMount).mockReturnValueOnce(request.promise);
    const first=f.actions.handleToggleMount();
    await f.actions.handleToggleMount();await f.actions.handleToggleMount();
    expect(toggleMount).toHaveBeenCalledTimes(1);
    expect(document.querySelector('button')!.disabled).toBe(true);
    request.resolve(f.result(true));await first;
    expect(f.save().mount!.mounted).toBe(true);
    expect(document.querySelector('button')!.disabled).toBe(false);
  });
  it('waits for mounting then shares one dismount across simultaneous interactions', async()=>{
    const f=fixture(),mount=deferred<Awaited<ReturnType<typeof toggleMount>>>(),dismount=deferred<Awaited<ReturnType<typeof dismountMount>>>();
    vi.mocked(toggleMount).mockReturnValueOnce(mount.promise);vi.mocked(dismountMount).mockReturnValueOnce(dismount.promise);
    const toggle=f.actions.handleToggleMount(),a=f.actions.ensureDismounted(),b=f.actions.ensureDismounted();
    expect(dismountMount).not.toHaveBeenCalled();
    mount.resolve(f.result(true));await toggle;
    expect(dismountMount).toHaveBeenCalledTimes(1);
    dismount.resolve(f.result(false,3));
    expect(await a).toBe(true);expect(await b).toBe(true);
    expect(dismountMount).toHaveBeenCalledTimes(1);expect(f.save().mount!.mounted).toBe(false);
  });
  it.each(['character','location','revision'])('ignores a late response after a newer %s',async change=>{
    const f=fixture(),request=deferred<Awaited<ReturnType<typeof toggleMount>>>();
    vi.mocked(toggleMount).mockReturnValueOnce(request.promise);
    const stale=f.result(true),toggle=f.actions.handleToggleMount();
    f.set(change==='character'?{id:'other'}:change==='location'?{location:'haven_apartment'}:{revision:3});
    request.resolve(stale);await toggle;
    expect(f.deps.setSave).not.toHaveBeenCalled();expect(f.deps.updateHud).not.toHaveBeenCalled();expect(f.deps.showToast).not.toHaveBeenCalled();
  });
  it('reports a failed dismount and refuses the dependent interaction',async()=>{
    const f=fixture(true);
    vi.mocked(dismountMount).mockRejectedValueOnce(new Error('Нет связи'));
    expect(await f.actions.ensureDismounted()).toBe(false);
    expect(f.save().mount!.mounted).toBe(true);
    expect(f.deps.showToast).toHaveBeenCalledWith('Нет связи');
    expect(document.querySelector('button')!.disabled).toBe(false);
  });
  it('does not continue an interaction after travel while mounting was pending',async()=>{
    const f=fixture(),request=deferred<Awaited<ReturnType<typeof toggleMount>>>();
    vi.mocked(toggleMount).mockReturnValueOnce(request.promise);
    const toggle=f.actions.handleToggleMount(),interaction=f.actions.ensureDismounted();
    const stale=f.result(true);f.set({location:'haven_apartment'});request.resolve(stale);
    await toggle;expect(await interaction).toBe(false);expect(dismountMount).not.toHaveBeenCalled();
  });
});
