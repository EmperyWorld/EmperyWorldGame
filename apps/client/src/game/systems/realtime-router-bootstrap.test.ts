import { describe, expect, it, vi } from 'vitest';
vi.mock('../../sprites/sprite-loader.js',()=>({playHurtFlash:vi.fn()}));
vi.mock('../../death-ui.js',()=>({syncDeathScreen:vi.fn()}));
import { RealtimeRouter } from './RealtimeRouter.js';
function fixture(){
  const player={player:{active:true,scene:{physics:{world:{bounds:{width:2000,height:2000}}}}},isDead:false,setPosition:vi.fn()};
  const setSave=vi.fn(),applySnapshot=vi.fn();
  const router=new RealtimeRouter({getSave:()=>({location:'adena_fields',worldX:100,worldY:100,hp:100,maxHp:100}),getLocationId:()=> 'adena_fields',getStats:()=>({}),getCallbacks:()=>undefined,getPlayerCtrl:()=>player,remotePlayers:{applySnapshot},setSave} as any);
  return {router,player,setSave,applySnapshot};
}
describe('authoritative reconnect placement',()=>{
  it.each([{x:1500,y:1800},{x:20,y:20}])('accepts a clear current-map welcome at $x,$y independent of stale saved distance',pose=>{
    const f=fixture();f.router.handleBootstrap({self:{...pose,locationId:'adena_fields',hp:100,maxHp:100},snapshot:{}} as any);
    expect(f.player.setPosition).toHaveBeenCalledWith(pose.x,pose.y);expect(f.setSave).toHaveBeenCalledWith(expect.objectContaining({worldX:pose.x,worldY:pose.y}));
  });
  it('ignores a bootstrap from another map before changing actors, vitals or position',()=>{
    const f=fixture();f.router.handleBootstrap({self:{x:100,y:100,locationId:'empery_haven',hp:0,maxHp:100},snapshot:{}} as any);
    expect(f.player.setPosition).not.toHaveBeenCalled();expect(f.setSave).not.toHaveBeenCalled();expect(f.applySnapshot).not.toHaveBeenCalled();
  });
});
