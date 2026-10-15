import { describe, expect, it } from 'vitest';
import {
  GAMEPAD_DEADZONE,
  GamepadInput,
  applyDeadzone,
  pickFirstGamepad,
  readGamepadSnapshot,
  type GamepadLike,
} from './gamepad-input.js';

function pad(overrides: Partial<GamepadLike> = {}): GamepadLike {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  return {
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons,
    ...overrides,
  };
}

function press(base: GamepadLike, index: number, pressed = true): GamepadLike {
  const buttons = base.buttons.map((b, i) =>
    i === index ? { pressed, value: pressed ? 1 : 0 } : { pressed: b.pressed, value: b.value ?? 0 },
  );
  return { ...base, buttons };
}

describe('applyDeadzone', () => {
  it('zeros values inside the deadzone and rescales outside', () => {
    expect(applyDeadzone(0)).toBe(0);
    expect(applyDeadzone(GAMEPAD_DEADZONE - 0.01)).toBe(0);
    expect(applyDeadzone(-(GAMEPAD_DEADZONE - 0.01))).toBe(0);
    expect(applyDeadzone(1)).toBeCloseTo(1);
    expect(applyDeadzone(-1)).toBeCloseTo(-1);
    const mid = applyDeadzone(0.64);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('readGamepadSnapshot', () => {
  it('reads left stick and face buttons', () => {
    const snapped = readGamepadSnapshot(
      press({ ...pad(), axes: [0.9, -0.9, 0, 0] }, 0, true),
    );
    expect(snapped.connected).toBe(true);
    expect(snapped.lx).toBeGreaterThan(0.5);
    expect(snapped.ly).toBeLessThan(-0.5);
    expect(snapped.down.has('south')).toBe(true);
    expect(snapped.down.has('east')).toBe(false);
  });
});

describe('pickFirstGamepad', () => {
  it('skips null slots', () => {
    expect(pickFirstGamepad([null, pad()])).not.toBeNull();
    expect(pickFirstGamepad([null, null])).toBeNull();
  });

  it('prefers Standard Gamepad mapping over HID extras', () => {
    const gyro = pad({ id: 'DualSense Wireless Controller Motion Sensors', mapping: '' });
    const real = pad({ id: 'DualSense Wireless Controller', mapping: 'standard' });
    expect(pickFirstGamepad([gyro, real])).toBe(real);
  });
});

describe('GamepadInput', () => {
  it('consumes a button only on the rising edge', () => {
    let current = press(pad(), 2, true);
    const gp = new GamepadInput(() => [current]);
    gp.poll(100);
    expect(gp.consume('west')).toBe(true);
    expect(gp.consume('west')).toBe(false);
    gp.poll(120);
    expect(gp.consume('west')).toBe(false);
    current = press(pad(), 2, false);
    gp.poll(140);
    current = press(pad(), 2, true);
    gp.poll(160);
    expect(gp.consume('west')).toBe(true);
  });

  it('coalesces polls within the min interval', () => {
    let current = press(pad(), 0, true);
    const gp = new GamepadInput(() => [current]);
    gp.poll(10);
    expect(gp.consume('south')).toBe(true);
    current = press(pad(), 1, true);
    gp.poll(12);
    expect(gp.consume('east')).toBe(false);
  });

  it('adds d-pad to the move axis', () => {
    const gp = new GamepadInput(() => [press(pad(), 15, true)]);
    gp.poll(50);
    expect(gp.getAxis().x).toBe(1);
    expect(gp.getAxis().y).toBe(0);
  });

  it('keeps an unconsumed edge while overlay polls again (Phaser lag)', () => {
    let current = press(pad(), 0, true);
    const gp = new GamepadInput(() => [current]);
    gp.poll(10);
    gp.poll(30);
    expect(gp.consume('south')).toBe(true);
    expect(gp.consume('south')).toBe(false);
  });

  it('drops a latched edge when the button is released unconsumed', () => {
    let current = press(pad(), 0, true);
    const gp = new GamepadInput(() => [current]);
    gp.poll(10);
    current = press(pad(), 0, false);
    gp.poll(30);
    expect(gp.consume('south')).toBe(false);
  });
});

describe('Logitech F310 / Linux xpad (no Standard mapping)', () => {
  function f310(overrides: Partial<GamepadLike> = {}): GamepadLike {
    return pad({
      id: 'Logitech Gamepad F310',
      mapping: '',
      axes: [0, 0, 0, 0, 0, 0, 0, 0],
      ...overrides,
    });
  }

  it('reads A/B/X/Y on 0–3 and Back on 6, not as LT', () => {
    const snapped = readGamepadSnapshot(press(f310(), 6, true));
    expect(snapped.down.has('back')).toBe(true);
    expect(snapped.down.has('lt')).toBe(false);
    expect(readGamepadSnapshot(press(f310(), 0, true)).down.has('south')).toBe(true);
  });

  it('reads D-pad from hat axes 6/7', () => {
    const snapped = readGamepadSnapshot(f310({ axes: [0, 0, 0, 0, 0, 0, -1, 1] }));
    expect(snapped.down.has('dpadLeft')).toBe(true);
    expect(snapped.down.has('dpadDown')).toBe(true);
  });
});
