/** Standard Gamepad mapping (W3C). Analog stick + D-pad share the WASD axis. */

export const GAMEPAD_DEADZONE = 0.28;
export const GAMEPAD_POLL_MIN_MS = 8;

export type GamepadFace =
  | 'south'
  | 'east'
  | 'west'
  | 'north'
  | 'lb'
  | 'rb'
  | 'lt'
  | 'rt'
  | 'back'
  | 'start'
  | 'l3'
  | 'r3'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight';

/** W3C Standard Gamepad (Chrome remap). */
const STANDARD_BUTTON: Record<GamepadFace, number> = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  l3: 10,
  r3: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
};

/**
 * Linux xpad / Logitech F310 XInput when `mapping` is empty.
 * Face 0–3 same as standard; Back/Start/LS/RS are 6–9; D-pad is hat axes 6/7.
 */
const XINPUT_RAW_BUTTON: Partial<Record<GamepadFace, number>> = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  lb: 4,
  rb: 5,
  back: 6,
  start: 7,
  l3: 8,
  r3: 9,
};

function analogTrigger(value: number): boolean {
  return Number.isFinite(value) && value > 0.55;
}

function applyHatDpad(axes: readonly number[], down: Set<GamepadFace>): void {
  const hx = axes[6];
  const hy = axes[7];
  if (typeof hx === 'number') {
    if (hx <= -0.5) down.add('dpadLeft');
    else if (hx >= 0.5) down.add('dpadRight');
  }
  if (typeof hy === 'number') {
    if (hy <= -0.5) down.add('dpadUp');
    else if (hy >= 0.5) down.add('dpadDown');
  }
}

export interface GamepadSnapshot {
  connected: boolean;
  lx: number;
  ly: number;
  down: ReadonlySet<GamepadFace>;
}

export interface GamepadLike {
  connected?: boolean;
  id?: string;
  mapping?: string;
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value?: number }>;
}

/** HID extras that show up as gamepads on Linux (gyro, DualSense touchpad). */
const NOISE_PAD_ID = /motion|sensor|touchpad|accelerometer|gyro|keyboard|mouse/i;

export function isNoiseGamepad(pad: GamepadLike): boolean {
  return NOISE_PAD_ID.test(pad.id ?? '');
}

export function applyDeadzone(value: number, deadzone = GAMEPAD_DEADZONE): number {
  if (!Number.isFinite(value)) return 0;
  const mag = Math.abs(value);
  if (mag < deadzone) return 0;
  return Math.sign(value) * ((mag - deadzone) / (1 - deadzone));
}

function buttonDown(pad: GamepadLike, index: number): boolean {
  const btn = pad.buttons[index];
  if (!btn) return false;
  if (btn.pressed) return true;
  return (btn.value ?? 0) > 0.5;
}

export function readGamepadSnapshot(pad: GamepadLike | null | undefined): GamepadSnapshot {
  if (!pad || pad.connected === false) {
    return { connected: false, lx: 0, ly: 0, down: new Set() };
  }
  const down = new Set<GamepadFace>();
  const standard = pad.mapping === 'standard';
  const layout = standard ? STANDARD_BUTTON : XINPUT_RAW_BUTTON;
  for (const [face, index] of Object.entries(layout) as Array<[GamepadFace, number]>) {
    if (buttonDown(pad, index)) down.add(face);
  }
  if (!standard) {
    applyHatDpad(pad.axes, down);
    if (analogTrigger(pad.axes[2] ?? 0)) down.add('lt');
    if (analogTrigger(pad.axes[5] ?? 0)) down.add('rt');
  }
  return {
    connected: true,
    lx: applyDeadzone(pad.axes[0] ?? 0),
    ly: applyDeadzone(pad.axes[1] ?? 0),
    down,
  };
}

export function pickFirstGamepad(pads: Array<GamepadLike | null>): GamepadLike | null {
  const present = pads.filter((p): p is GamepadLike => p != null && p.connected !== false);
  const playable = present.filter((p) => !isNoiseGamepad(p));
  const pool = playable.length > 0 ? playable : present;
  return pool.find((p) => p.mapping === 'standard') ?? pool[0] ?? null;
}

export type GamepadSource = () => Array<GamepadLike | null>;

function defaultSource(): Array<GamepadLike | null> {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return [];
  }
  return [...navigator.getGamepads()];
}

/**
 * Coalesced poll + edge consume.
 * Overlay rAF and Phaser both call poll(); Phaser can lag behind 60 Hz overlay.
 * justPressed latches until consume() or release — otherwise only the stick works.
 */
export class GamepadInput {
  private source: GamepadSource;
  private lastPollAt = 0;
  private prevDown = new Set<GamepadFace>();
  private justPressed = new Set<GamepadFace>();
  private snapshot: GamepadSnapshot = { connected: false, lx: 0, ly: 0, down: new Set() };

  constructor(source: GamepadSource = defaultSource) {
    this.source = source;
  }

  setSource(source: GamepadSource): void {
    this.source = source;
  }

  poll(now = typeof performance !== 'undefined' ? performance.now() : Date.now()): GamepadSnapshot {
    if (now - this.lastPollAt < GAMEPAD_POLL_MIN_MS && this.lastPollAt !== 0) {
      return this.snapshot;
    }
    this.lastPollAt = now;
    const snap = readGamepadSnapshot(pickFirstGamepad(this.source()));
    for (const face of snap.down) {
      if (!this.prevDown.has(face)) this.justPressed.add(face);
    }
    for (const face of this.justPressed) {
      if (!snap.down.has(face)) this.justPressed.delete(face);
    }
    this.prevDown = new Set(snap.down);
    this.snapshot = snap;
    return snap;
  }

  getAxis(): { x: number; y: number } {
    const snap = this.snapshot;
    let x = snap.lx;
    let y = snap.ly;
    if (snap.down.has('dpadLeft')) x -= 1;
    if (snap.down.has('dpadRight')) x += 1;
    if (snap.down.has('dpadUp')) y -= 1;
    if (snap.down.has('dpadDown')) y += 1;
    return { x, y };
  }

  isConnected(): boolean {
    return this.snapshot.connected;
  }

  consume(face: GamepadFace): boolean {
    if (!this.justPressed.has(face)) return false;
    this.justPressed.delete(face);
    return true;
  }

  isDown(face: GamepadFace): boolean {
    return this.snapshot.down.has(face);
  }

  reset(): void {
    this.lastPollAt = 0;
    this.prevDown.clear();
    this.justPressed.clear();
    this.snapshot = { connected: false, lx: 0, ly: 0, down: new Set() };
  }
}

export const gamepadInput = new GamepadInput();
