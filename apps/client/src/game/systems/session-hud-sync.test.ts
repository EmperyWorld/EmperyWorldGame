import { describe, expect, it, vi } from 'vitest';
import { flushRealtimePlayerPosition, syncRealtimePlayerInput, type RealtimeInputState } from './session-hud-sync.js';
import type { PlayerController } from '../controllers/PlayerController.js';
import type { RealtimeGateway } from './RealtimeGateway.js';
function fixture(){
  const sendMovement=vi.fn();
  const frames=[{dx:1,dy:0,prediction:{x:100,y:100}},{dx:0,dy:0,prediction:{x:100,y:100}}];
  const player={player:{active:true},x:100,y:100,isDead:false,isMoving:false,isDashing:false,isCharging:false,getFacingRight:()=>true,getMoveIntent:()=>({vx:1,vy:0}),takeMovementFrames:()=>frames.splice(0)};
  const realtime={sendMovement,isPlayerInputFrozen:()=>false,movementCapacity:()=>8};
  const state:RealtimeInputState={lastAt:0,lastSent:{x:90,y:100,moving:true,facing:'right'}};
  return {sendMovement,player,frames,state,opts:{now:100,playerCtrl:player as unknown as PlayerController,realtime:realtime as unknown as RealtimeGateway,state}};
}
describe('fixed-step input transitions',()=>{
  it('sends each predicted step once and persists a server pose without coordinates',()=>{
    const f=fixture();syncRealtimePlayerInput(f.opts);syncRealtimePlayerInput(f.opts);
    expect(f.sendMovement).toHaveBeenCalledTimes(2);
    expect(f.sendMovement.mock.calls.map(([input])=>input.dx)).toEqual([1,0]);
    flushRealtimePlayerPosition(f.opts);
    expect(f.sendMovement.mock.calls[2][0]).toEqual({dx:0,dy:0,persist:true});
  });
  it('discards frames during a frozen handoff and does not claim to flush without a transport slot', () => {
    const f=fixture();f.opts.realtime={...f.opts.realtime,isPlayerInputFrozen:()=>true} as RealtimeGateway;
    syncRealtimePlayerInput(f.opts);expect(f.frames).toEqual([]);expect(f.sendMovement).not.toHaveBeenCalled();
    f.opts.realtime={...f.opts.realtime,isPlayerInputFrozen:()=>false,movementCapacity:()=>0} as RealtimeGateway;
    expect(flushRealtimePlayerPosition(f.opts)).toBeNull();
  });
  it('sends dash starts immediately between movement steps',()=>{
    const f=fixture();f.frames.length=0;f.player.isCharging=true;f.state.lastAt=99;
    syncRealtimePlayerInput(f.opts);
    expect(f.sendMovement).toHaveBeenCalledTimes(1);expect(f.sendMovement.mock.calls[0][0]).toEqual({dx:0,dy:0,dash:true});
    syncRealtimePlayerInput(f.opts);expect(f.sendMovement).toHaveBeenCalledTimes(1);
  });
});
