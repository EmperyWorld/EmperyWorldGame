// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./api.js',()=>({fetchLocation:vi.fn(),fetchSave:vi.fn(),fetchStats:vi.fn(),travelTo:vi.fn()}));
import {fetchLocation,fetchSave,fetchStats,travelTo,type LocationDefinition,type PlayerSave,type PlayerStats} from './api.js';
import {createTravelActions} from './travel-actions.js';
import type {LocationConfig} from './game/scenes/location-types.js';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const location=(id:string)=>({id,name:id,spawn:{x:100,y:100}} as LocationDefinition);
function fixture(){
  let save={id:'hero',location:'origin',revision:1,questFlags:{}} as PlayerSave;
  let loc={id:'origin'} as LocationConfig;
  const deps={getSave:()=>save,setSave:vi.fn((next:PlayerSave)=>{save=next;}),setStats:vi.fn(),getLocation:()=>loc,setLocation:vi.fn((next:LocationConfig)=>{loc=next;}),toGameLocation:(next:LocationDefinition)=>next as LocationConfig,
    updateHud:vi.fn(),showToast:vi.fn(),transitionLocation:vi.fn(),syncUiBlocked:vi.fn(),travelEl:document.createElement('div'),onTravelResult:vi.fn(),notifyRealtimeTravel:vi.fn()};
  vi.mocked(fetchLocation).mockImplementation(async id=>location(id));
  vi.mocked(fetchSave).mockImplementation(async()=>save);
  vi.mocked(fetchStats).mockResolvedValue({} as PlayerStats);
  const result=(id='dest')=>({save:{...save,revision:2,location:id},stats:{} as PlayerStats,location:location(id)});
  vi.mocked(travelTo).mockImplementation(async(_id,dest)=>result(dest));
  return {deps,actions:createTravelActions(deps),result,setSave:(next:Partial<PlayerSave>)=>{save={...save,...next};},setLocation:(id:string)=>{loc={id} as LocationConfig;}};
}
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();});
afterEach(()=>vi.useRealTimers());
describe('travel lifecycle',()=>{
  it('applies a successful transition once',async()=>{
    const f=fixture();await f.actions.doTravel('dest');
    expect(f.deps.setSave).toHaveBeenCalledWith(expect.objectContaining({id:'hero',location:'dest'}));
    expect(f.deps.transitionLocation).toHaveBeenCalledTimes(1);expect(f.deps.onTravelResult).toHaveBeenCalledWith(true);
    expect(vi.mocked(travelTo).mock.calls[0]![2]).toBeInstanceOf(AbortSignal);
  });
  it('does not send travel after the character changed while loading the destination',async()=>{
    const f=fixture(),read=deferred<LocationDefinition>();vi.mocked(fetchLocation).mockReturnValueOnce(read.promise);
    const pending=f.actions.doTravel('dest');f.setSave({id:'other'});read.resolve(location('dest'));await pending;
    expect(travelTo).not.toHaveBeenCalled();expect(f.deps.setSave).not.toHaveBeenCalled();
  });
  it.each(['character','map','scene'])('ignores a travel reply after another %s',async change=>{
    const f=fixture(),reply=deferred<Awaited<ReturnType<typeof travelTo>>>();vi.mocked(travelTo).mockReturnValueOnce(reply.promise);
    const pending=f.actions.doTravel('dest');await vi.advanceTimersByTimeAsync(0);
    const result=f.result();
    if(change==='character')f.setSave({id:'other'});else if(change==='map')f.setSave({location:'other'});else f.setLocation('other');
    reply.resolve(result);await pending;
    expect(f.deps.setSave).not.toHaveBeenCalled();expect(f.deps.transitionLocation).not.toHaveBeenCalled();expect(f.deps.onTravelResult).not.toHaveBeenCalled();
  });
  it('recovers a committed server transition after losing the POST response',async()=>{
    const f=fixture();vi.mocked(travelTo).mockRejectedValueOnce(new Error('Failed to fetch'));
    vi.mocked(fetchSave).mockResolvedValueOnce(f.result().save);
    await f.actions.doTravel('dest');
    expect(f.deps.transitionLocation).toHaveBeenCalledTimes(1);expect(f.deps.onTravelResult).toHaveBeenCalledWith(true);
    expect(f.deps.notifyRealtimeTravel).toHaveBeenCalledWith('dest');
  });
  it('bounds destination loading and never sends a POST after that deadline',async()=>{
    const f=fixture(),read=deferred<LocationDefinition>();vi.mocked(fetchLocation).mockReturnValueOnce(read.promise);
    const pending=f.actions.doTravel('dest');await vi.advanceTimersByTimeAsync(10000);await pending;
    expect(f.deps.onTravelResult).toHaveBeenCalledWith(false);
    read.resolve(location('dest'));await vi.advanceTimersByTimeAsync(0);expect(travelTo).not.toHaveBeenCalled();
    await f.actions.doTravel('other');expect(travelTo).toHaveBeenCalledTimes(1);expect(f.deps.notifyRealtimeTravel).toHaveBeenCalledWith('other');
  });
  it('ignores a timed out POST response after a later successful travel',async()=>{
    const f=fixture(),reply=deferred<Awaited<ReturnType<typeof travelTo>>>(),stale=f.result();vi.mocked(travelTo).mockReturnValueOnce(reply.promise);
    const pending=f.actions.doTravel('dest');await vi.advanceTimersByTimeAsync(10000);await pending;
    expect(vi.mocked(travelTo).mock.calls[0]![2]!.aborted).toBe(true);
    await f.actions.doTravel('other');reply.resolve(stale);await vi.advanceTimersByTimeAsync(0);
    expect(f.deps.setSave).toHaveBeenCalledTimes(1);expect(f.deps.setSave).toHaveBeenCalledWith(expect.objectContaining({location:'other'}));
  });
  it('bounds reconciliation and ignores late recovery reads',async()=>{
    const f=fixture(),read=deferred<PlayerSave>();vi.mocked(travelTo).mockRejectedValueOnce(new Error('Lost response'));vi.mocked(fetchSave).mockReturnValueOnce(read.promise);
    const pending=f.actions.doTravel('dest');await vi.advanceTimersByTimeAsync(5000);await pending;
    read.resolve(f.result().save);await vi.advanceTimersByTimeAsync(0);
    expect(f.deps.setSave).not.toHaveBeenCalled();expect(f.deps.onTravelResult).toHaveBeenCalledWith(false);
  });
  it('does not enqueue concurrent travel commands',async()=>{
    const f=fixture(),reply=deferred<Awaited<ReturnType<typeof travelTo>>>();vi.mocked(travelTo).mockReturnValueOnce(reply.promise);
    const first=f.actions.doTravel('dest');await vi.advanceTimersByTimeAsync(0);await f.actions.doTravel('other');
    expect(travelTo).toHaveBeenCalledTimes(1);reply.resolve(f.result());await first;
  });
  it('does not replace a newer revision with a delayed travel reply',async()=>{
    const f=fixture(),reply=deferred<Awaited<ReturnType<typeof travelTo>>>(),stale=f.result();vi.mocked(travelTo).mockReturnValueOnce(reply.promise);
    const pending=f.actions.doTravel('dest');await vi.advanceTimersByTimeAsync(0);f.setSave({revision:3});reply.resolve(stale);await pending;
    expect(f.deps.setSave).not.toHaveBeenCalled();expect(f.deps.transitionLocation).not.toHaveBeenCalled();
  });
});
