import type { PlayerController } from '../controllers/PlayerController.js';
import type { GameRegistryCallbacks } from './RealtimeRouter.js';
import type { RealtimeGateway } from './RealtimeGateway.js';

export interface StaminaHudSyncState {
  lastKey: string;
  lastAt: number;
}

/** Throttled mount/player stamina → HUD callbacks + occasional server sync. */
export function syncStaminaHud(opts: {
  now: number;
  playerCtrl: PlayerController;
  callbacks: GameRegistryCallbacks | undefined;
  state: StaminaHudSyncState;
}): void {
  const stamHud = opts.playerCtrl.getMountStaminaHud();
  const playerHud = opts.playerCtrl.getPlayerStaminaHud();
  const hudKey = `${stamHud ? `${stamHud.mounted ? 1 : 0}:${Math.round(stamHud.stamina)}:${stamHud.canRun ? 1 : 0}` : 'none'}|${Math.round(playerHud.stamina)}:${playerHud.canRun ? 1 : 0}`;
  if (hudKey !== opts.state.lastKey || opts.now - opts.state.lastAt > 250) {
    opts.state.lastKey = hudKey;
    opts.state.lastAt = opts.now;
    opts.callbacks?.onMountStamina?.(stamHud);
    opts.callbacks?.onPlayerStamina?.(playerHud);
  }
  const syncMount = opts.playerCtrl.takeMountStaminaSync();
  if (syncMount != null) opts.callbacks?.onMountStaminaSync?.(syncMount);
  const syncPlayer = opts.playerCtrl.takePlayerStaminaSync();
  if (syncPlayer != null) opts.callbacks?.onPlayerStaminaSync?.(syncPlayer);
}

export interface RealtimeInputState {
  lastAt: number;
  lastSent: { x: number; y: number; moving: boolean; facing: 'left' | 'right'; dash?:boolean };
}

export function syncRealtimePlayerInput(opts: {
  now: number;
  playerCtrl: PlayerController;
  realtime: RealtimeGateway;
  state: RealtimeInputState;
}): void {
  const frames=opts.playerCtrl.takeMovementFrames();
  if (opts.realtime.isPlayerInputFrozen() || !opts.playerCtrl.player?.active || opts.playerCtrl.isDead) return;
  const dash=opts.playerCtrl.isDashing||opts.playerCtrl.isCharging;
  const pulse=dash&&!opts.state.lastSent.dash;
  for(let i=0;i<frames.length;i++)opts.realtime.sendMovement({dx:frames[i]!.dx,dy:frames[i]!.dy,dash:pulse&&i===0},frames[i]!.prediction);
  // Dash must reach the server before HTTP mount-charge even between simulation steps.
  if(pulse&&!frames.length)opts.realtime.sendMovement({dx:0,dy:0,dash:true},{x:opts.playerCtrl.x,y:opts.playerCtrl.y});
  opts.state.lastAt=opts.now;
  opts.state.lastSent={x:opts.playerCtrl.x,y:opts.playerCtrl.y,moving:opts.playerCtrl.isMoving||dash,facing:opts.playerCtrl.getFacingRight()?'right':'left',dash};
}

/** Persist the server-computed pose; no client coordinates are trusted. */
export function flushRealtimePlayerPosition(opts: {
  playerCtrl: PlayerController;
  realtime: RealtimeGateway;
  state: RealtimeInputState;
}): {x:number;y:number}|null {
  if(opts.realtime.isPlayerInputFrozen()||!opts.realtime.movementCapacity()||!opts.playerCtrl.player?.active)return null;
  opts.realtime.sendMovement({dx:0,dy:0,persist:true},{x:opts.playerCtrl.x,y:opts.playerCtrl.y});
  return {x:opts.playerCtrl.x,y:opts.playerCtrl.y};
}
