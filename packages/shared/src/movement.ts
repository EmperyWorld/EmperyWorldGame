export const MOVEMENT_PROTOCOL = 4;
export const MOVEMENT_STEP_MS = 50;
export const PLAYER_COLLISION_RADIUS = 14;
export const MOUNT_COLLISION_RADIUS = 20;
export const MAX_INPUT_BACKLOG = 8;
export const FOOT_DASH_SPEED = 420;
export const FOOT_DASH_DURATION_MS = 180;
export const FOOT_DASH_COOLDOWN_MS = 700;
export const MOUNT_CHARGE_SPEED_MULT = 1.85;
export interface MovementCommand {
  type: 'move_command';
  seq: number;
  locationId: string;
  dx: number;
  dy: number;
  dash?: boolean;
  persist?: boolean;
}
export interface MovementSnapshot {
  locationId: string;
  x: number;
  y: number;
  ack: number;
  serverTime: number;
  moving: boolean;
}
