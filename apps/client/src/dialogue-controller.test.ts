// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./api.js',()=>({fetchDialogue:vi.fn(),applyDialogueChoice:vi.fn(),fetchStats:vi.fn(),restAtHousing:vi.fn(),buyHousing:vi.fn(),enterHousing:vi.fn()}));
vi.mock('./world-clock.js',()=>({getWorldGameHour:()=>12,getHavenSchedule:()=>null,getAbsoluteGameHours:()=>12}));
import {fetchDialogue,applyDialogueChoice,fetchStats,type PlayerSave,type PlayerStats,type DialogueResponse} from './api.js';
import {DialogueController,type DialogueControllerHost} from './dialogue-controller.js';
function deferred<T>(){let resolve!:(value:T)=>void, reject!:(reason:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(){
  let save={id:'hero',location:'adena_fields',revision:1} as PlayerSave;
  const host={getSave:()=>save,setSave:vi.fn((s:PlayerSave)=>{save=s;}),getStats:()=>({} as PlayerStats),setStats:vi.fn(),updateHud:vi.fn(),assetUrl:()=>undefined,showToast:vi.fn(),syncUiBlocked:vi.fn(),setTalkingNpc:vi.fn(),getLocationId:()=>save.location} as unknown as DialogueControllerHost;
  const response=(name='Captain')=>({npcName:name,text:'Hello',choices:[{id:'talk',label:'Continue'}]} as DialogueResponse);
  vi.mocked(fetchDialogue).mockResolvedValue(response());vi.mocked(fetchStats).mockResolvedValue({} as PlayerStats);
  const controller=new DialogueController(host);
  return {controller,host,response,set:(patch:Partial<PlayerSave>)=>{save={...save,...patch};},save:()=>save};
}
beforeEach(()=>{
  vi.resetAllMocks();vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  document.body.innerHTML=['scene','npc-name','channel','text','portrait','portrait-placeholder','choices','close'].map(id=>`<${id==='portrait'?'img':'div'} id="dialogue-${id}"></${id==='portrait'?'img':'div'}>`).join('');
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const choices=()=>document.querySelectorAll<HTMLButtonElement>('#dialogue-choices button');
async function finishText(){await vi.advanceTimersByTimeAsync(500);}
describe('dialogue lifecycle',()=>{
  it('does not reopen or apply a reply after closing and aborts its fetch',async()=>{
    const f=fixture(),reply=deferred<DialogueResponse>();vi.mocked(fetchDialogue).mockReturnValueOnce(reply.promise);
    const pending=f.controller.show('town_captain');f.controller.close();
    expect(vi.mocked(fetchDialogue).mock.calls[0]![3]!.aborted).toBe(true);
    reply.resolve({...f.response(),save:{...f.save(),revision:2}} as DialogueResponse);await pending;
    expect(f.controller.isOpen()).toBe(false);expect(f.host.setSave).not.toHaveBeenCalled();
  });
  it.each(['reply','error'])('does not disturb a newer NPC after an older %s',async kind=>{
    const f=fixture(),old=deferred<DialogueResponse>();vi.mocked(fetchDialogue).mockReturnValueOnce(old.promise);
    const pending=f.controller.show('town_captain');vi.mocked(fetchDialogue).mockResolvedValueOnce(f.response('Other'));await f.controller.show('town_guard');
    if(kind==='reply')old.resolve(f.response('Old'));else old.reject(new Error('Old failure'));await pending;
    expect(f.controller.isOpen()).toBe(true);expect(document.getElementById('dialogue-npc-name')!.textContent).toBe('Other');expect(f.host.showToast).not.toHaveBeenCalled();f.controller.close();
  });
  it.each(['character','location'])('ignores results after changing %s',async change=>{
    const f=fixture(),reply=deferred<DialogueResponse>();vi.mocked(fetchDialogue).mockReturnValueOnce(reply.promise);
    const pending=f.controller.show('town_captain');f.set(change==='character'?{id:'other'}:{location:'empery_haven'});reply.resolve(f.response());await pending;
    expect(document.getElementById('dialogue-npc-name')!.textContent).toBe('...');expect(f.host.setSave).not.toHaveBeenCalled();f.controller.close();
  });
  it('sends one choice for repeated button clicks and keeps controls disabled while pending',async()=>{
    const f=fixture(),reply=deferred<Awaited<ReturnType<typeof applyDialogueChoice>>>();vi.mocked(applyDialogueChoice).mockReturnValueOnce(reply.promise);
    await f.controller.show('town_captain');await finishText();const button=choices()[0]!;button.click();button.click();
    expect(applyDialogueChoice).toHaveBeenCalledTimes(1);expect(button.disabled).toBe(true);
    reply.resolve({save:{...f.save(),revision:2}});await vi.advanceTimersByTimeAsync(0);
    expect(f.controller.isOpen()).toBe(false);expect(f.host.setSave).toHaveBeenCalledTimes(1);
  });
  it('reports a choice error and restores usable controls',async()=>{
    const f=fixture();vi.mocked(applyDialogueChoice).mockRejectedValueOnce(new Error('No connection'));
    await f.controller.show('town_captain');await finishText();choices()[0]!.click();await vi.advanceTimersByTimeAsync(0);
    expect(f.controller.isOpen()).toBe(true);expect(choices()[0]!.disabled).toBe(false);expect(f.host.showToast).toHaveBeenCalled();f.controller.close();
  });
  it('ignores an old choice after another conversation opens',async()=>{
    const f=fixture(),reply=deferred<Awaited<ReturnType<typeof applyDialogueChoice>>>();vi.mocked(applyDialogueChoice).mockReturnValueOnce(reply.promise);
    await f.controller.show('town_captain');await finishText();const staleButton=choices()[0]!;staleButton.click();
    await f.controller.show('town_guard');reply.resolve({save:{...f.save(),revision:2},followUp:f.response('Old')});await vi.advanceTimersByTimeAsync(0);
    expect(f.host.setSave).not.toHaveBeenCalled();expect(document.getElementById('dialogue-npc-name')!.textContent).toBe('Captain');staleButton.disabled=false;staleButton.click();expect(applyDialogueChoice).toHaveBeenCalledTimes(1);f.controller.close();
  });
  it('does not freeze an NPC for a rejected radio service request',async()=>{
    const f=fixture();await f.controller.show('town_stable','radio');expect(f.host.setTalkingNpc).not.toHaveBeenCalled();expect(fetchDialogue).not.toHaveBeenCalled();
  });
  it('reuses the command key if stats loading fails after a successful paid choice',async()=>{
    const f=fixture();vi.mocked(applyDialogueChoice).mockImplementation(async()=>({save:{...f.save(),revision:2}}));
    vi.mocked(fetchStats).mockRejectedValueOnce(new Error('Stats unavailable')).mockResolvedValue({} as PlayerStats);
    await f.controller.show('town_captain');await finishText();choices()[0]!.click();await vi.advanceTimersByTimeAsync(0);
    expect(choices()[0]!.disabled).toBe(false);choices()[0]!.click();await vi.advanceTimersByTimeAsync(0);
    expect(applyDialogueChoice).toHaveBeenCalledTimes(2);
    const calls=vi.mocked(applyDialogueChoice).mock.calls;
    expect(calls[0]![5]).toBeTruthy();expect(calls[1]![5]).toBe(calls[0]![5]);expect(f.controller.isOpen()).toBe(false);
  });

  it('uses the selected resident portrait instead of shared district images',async()=>{
    const f=fixture();f.host.getCitizenPortrait=()=> 'portrait_haven_resident_007';
    f.host.assetUrl=id=>`/assets/${id}.webp`;
    const loads:Array<{src:string;onload:(()=>void)|null;onerror:(()=>void)|null}>=[];
    vi.stubGlobal('Image',class {src='';onload=null;onerror=null;constructor(){loads.push(this);}});
    vi.mocked(fetchDialogue).mockResolvedValue({...f.response(), portrait:'shared_face', choices:[{id:'talk',label:'Continue',portrait:'shared_choice_face'}]});
    await f.controller.show('haven_citizen_plaza');
    expect(loads.at(-1)?.src).toBe('/assets/portrait_haven_resident_007.webp');
    await finishText();
    expect(loads.every(load=>load.src.includes('portrait_haven_resident_007'))).toBe(true);
    expect(choices()[0]!.querySelector('img')?.getAttribute('src')).toBe('/assets/portrait_haven_resident_007.webp');
  });
  it('does not substitute another resident face when an individual portrait is unavailable',async()=>{
    const f=fixture();f.host.getCitizenPortrait=()=> 'portrait_haven_resident_007';
    f.host.assetUrl=id=>id.startsWith('portrait_haven_resident_')?undefined:`/assets/${id}.webp`;
    await f.controller.show('haven_citizen_plaza');
    expect(document.getElementById('dialogue-portrait-placeholder')!.style.display).toBe('grid');
  });

  it('ignores an older portrait load and a load completing after close',async()=>{
    const f=fixture();await f.controller.show('town_captain');
    const loads:Array<{src:string;onload:(()=>void)|null;onerror:(()=>void)|null}>=[];
    vi.stubGlobal('Image',class {src='';onload=null;onerror=null;constructor(){loads.push(this);}});
    f.host.assetUrl=id=>`/assets/${id}.webp`;
    const portrait=f.controller as unknown as {setPortrait:(id:string,npcId:string)=>void};
    portrait.setPortrait('first','town_captain');portrait.setPortrait('second','town_captain');
    loads[0]!.onload!();expect(document.getElementById('dialogue-portrait')!.getAttribute('src')).toBeNull();
    loads[1]!.onload!();expect(document.getElementById('dialogue-portrait')!.getAttribute('src')).toBe('/assets/second.webp');
    portrait.setPortrait('third','town_captain');f.controller.close();loads[2]!.onload!();
    expect(document.getElementById('dialogue-portrait')!.getAttribute('src')).toBe('/assets/second.webp');
  });

  it.each(['plaza','market','craft','cathedral','tavern','harbor','guard'])('opens an available %s resident without an individual service schedule',async district=>{
    const f=fixture();f.set({location:'empery_haven'});
    await f.controller.show(`haven_citizen_${district}`);
    expect(fetchDialogue).toHaveBeenCalledTimes(1);expect(f.controller.isOpen()).toBe(true);expect(f.host.showToast).not.toHaveBeenCalled();f.controller.close();
  });
  it('keeps scheduled service NPCs unavailable when their schedule is missing',async()=>{
    const f=fixture();f.set({location:'empery_haven'});await f.controller.show('town_merchant');
    expect(fetchDialogue).not.toHaveBeenCalled();expect(f.host.showToast).toHaveBeenCalledWith('Персонаж сейчас недоступен.');
  });

});
