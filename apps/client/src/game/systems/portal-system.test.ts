import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser',()=>({default:{}}));
import { PortalSystem } from './PortalSystem.js';
afterEach(()=>vi.unstubAllGlobals());
function fixture(second=false) {
  vi.stubGlobal('document',{getElementById:()=>null});
  const clicks: Array<(pointer: {button:number;rightButtonDown:()=>boolean})=>void> = [];
  function object() {
    const item:Record<string,unknown>={};
    for(const name of ['setOrigin','setDepth','setVisible','setStrokeStyle','setInteractive','setFillStyle','setText','setPosition'])item[name]=vi.fn(()=>item);
    item.on=vi.fn((_event:string,callback:(pointer: {button:number;rightButtonDown:()=>boolean})=>void)=>{clicks.push(callback);return item;});return item;
  }
  const prompt=object();
  const scene:any={time:{now:0},add:{text:()=>prompt,rectangle:()=>object()}};
  const player:any={x:50,y:50,isDead:false,setClickMoveTarget:vi.fn(),clearClickMove:vi.fn(),setVelocity:vi.fn()};
  const input:any={isUiBlocked:vi.fn(()=>false)},onTravel=vi.fn(),system=new PortalSystem();
  system.setup(scene,{} as any,{zones:[{x:200,y:200,label:'Entrance',travelTo:'test',radius:56},...(second?[{x:500,y:500,label:'Other',travelTo:'other',radius:56}]:[])]} as any,input,player,onTravel);
  return {system,scene,player,input,onTravel,prompt,click:(index=0,button=0)=>clicks[index]!({button,rightButtonDown:()=>button===2})};
}
describe('portal approach and confirmation',()=>{
  it('routes to a distant pad and waits for confirmation after arrival',()=>{
    const f=fixture();f.click();expect(f.player.setClickMoveTarget).toHaveBeenCalledWith(200,240);expect(f.onTravel).not.toHaveBeenCalled();
    f.player.x=200;f.player.y=240;f.click();expect(f.onTravel).toHaveBeenCalledWith('test');
    expect(f.player.clearClickMove).toHaveBeenCalledTimes(1);expect(f.player.setVelocity).toHaveBeenCalledWith(0,0);
    f.click();expect(f.onTravel).toHaveBeenCalledTimes(1);expect(f.player.setClickMoveTarget).toHaveBeenCalledTimes(1);
  });
  it.each(['blocked','dead'] as const)('does not start an approach while %s',kind=>{
    const f=fixture();if(kind==='blocked')f.input.isUiBlocked.mockReturnValue(true);else f.player.isDead=true;
    f.click();expect(f.player.setClickMoveTarget).not.toHaveBeenCalled();expect(f.onTravel).not.toHaveBeenCalled();
  });
  it('approaches the clicked distant portal instead of using another one underfoot',()=>{
    const f=fixture(true);f.player.x=200;f.player.y=240;
    f.system.update();f.click(1);
    expect(f.onTravel).not.toHaveBeenCalled();expect(f.player.setClickMoveTarget).toHaveBeenCalledWith(500,540);
    f.player.x=500;f.player.y=540;f.click(1);
    expect(f.onTravel).toHaveBeenCalledWith('other');
  });
  it.each([false,true])('ignores right-clicks both near and far, near=%s',near=>{
    const f=fixture();if(near){f.player.x=200;f.player.y=240;}f.click(0,2);
    expect(f.onTravel).not.toHaveBeenCalled();expect(f.player.setClickMoveTarget).not.toHaveBeenCalled();
  });
  it('allows an immediate retry after a failed request but keeps a pending request locked',()=>{
    const f=fixture();f.player.x=200;f.player.y=240;f.click();
    f.scene.time.now=15000;f.system.update();f.click();
    expect(f.onTravel).toHaveBeenCalledTimes(1);
    f.system.endTravelAttempt(true);f.click();expect(f.onTravel).toHaveBeenCalledTimes(2);
  });
  it('respects the spawn lock and hides prompts while the UI blocks travel',()=>{
    const f=fixture();f.player.x=200;f.player.y=240;f.system.setSpawnLock(0,400);f.click();
    expect(f.onTravel).not.toHaveBeenCalled();
    f.system.update();expect(f.prompt.setVisible).toHaveBeenLastCalledWith(false);
    f.scene.time.now=400;f.system.update();expect(f.prompt.setVisible).toHaveBeenLastCalledWith(true);
    f.input.isUiBlocked.mockReturnValue(true);f.system.update();expect(f.prompt.setVisible).toHaveBeenLastCalledWith(false);
  });

});
