import { SKILL_HOTBAR_SIZE } from '@empery/shared';
import { isChatFocused } from '../../chat-ui.js';
import { isTypingTarget } from '../../hotkeys.js';
import { gamepadInput, type GamepadFace } from './gamepad-input.js';

const SKILL_CODES = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
] as const;

const SKILL_NUMPAD = [
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
  'Numpad8',
  'Numpad9',
] as const;

const SKILL_PAD_FACE: Array<GamepadFace | undefined> = ['lb', 'rb', 'lt', 'rt'];

/**
 * Layout-independent game input via KeyboardEvent.code.
 * Phaser KeyCodes ломаются на не-EN раскладках — не используем их для WASD/скиллов.
 */
export class InputManager {
  private uiBlocked = false;
  private queuedSkill: number | null = null;
  private readonly moveAxis = { x: 0, y: 0 };
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private bound = false;
  private focused = true;
  private cancelEpoch = 0;
  get movementEpoch(): number { return this.cancelEpoch; }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || this.isUiBlocked()) return;
    this.down.add(e.code);
    this.pressed.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.focused = false; this.cancelEpoch++;
    this.down.clear();
    this.pressed.clear();
  };

  private readonly onFocus = (): void => { this.focused = true; };
  private readonly onVisibilityChange = (): void => { if (document.hidden) this.onBlur(); };

  bind(_scene: unknown): void {
    if (this.bound) return;
    this.bound = true;
    this.focused = typeof document === 'undefined' || !document.hidden;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Snapshot keyboard + gamepad once per gameplay frame. */
  beginFrame(): void {
    gamepadInput.poll();
  }

  shutdown(): void {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.down.clear();
    this.pressed.clear();
    this.queuedSkill = null;
    this.uiBlocked = false;
    this.focused = true;
    this.moveAxis.x = 0;
    this.moveAxis.y = 0;
    gamepadInput.reset();
  }

  setUiBlocked(blocked: boolean): void {
    this.uiBlocked = blocked;
    if (blocked) {
      this.down.clear();
      this.pressed.clear();
      this.queuedSkill = null;
    }
  }

  isUiBlocked(): boolean {
    return !this.focused || this.uiBlocked || isChatFocused() || isTypingTarget();
  }

  private isDown(code: string): boolean {
    return this.down.has(code);
  }

  private consume(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  private consumePad(face: GamepadFace): boolean {
    return gamepadInput.consume(face);
  }

  /** Movement axes; zero when UI / chat / typing. Keyboard digital + stick analog. */
  getMoveAxis(): { x: number; y: number } {
    if (this.isUiBlocked()) {
      this.moveAxis.x = 0;
      this.moveAxis.y = 0;
      return this.moveAxis;
    }
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    const pad = gamepadInput.getAxis();
    x += pad.x;
    y += pad.y;
    this.moveAxis.x = x;
    this.moveAxis.y = y;
    return this.moveAxis;
  }

  consumeAttack(): boolean {
    if (this.isUiBlocked()) return false;
    return this.consume('Space') || this.consumePad('west');
  }

  consumeDash(): boolean {
    if (this.isUiBlocked()) return false;
    return this.consume('ShiftLeft') || this.consume('ShiftRight') || this.consumePad('east');
  }

  consumeTalk(): boolean {
    if (this.isUiBlocked()) return false;
    return this.consume('KeyE') || this.consumePad('south');
  }

  /** Location pad: R. Not E/A — those stay talk (NPC often stands on the pad). */
  consumeTravel(): boolean {
    if (this.isUiBlocked()) return false;
    return this.consume('KeyR');
  }

  /** HUD click: same path as keys 1–9, consumed on the next combat frame. */
  queueSkill(slot: number): void {
    if (this.isUiBlocked()) return;
    if (slot < 0 || slot >= SKILL_HOTBAR_SIZE) return;
    this.queuedSkill = slot;
  }

  /** Slot index 0 = key 1 … up to SKILL_HOTBAR_SIZE-1 = key 9. */
  consumeSkill(slot: number): boolean {
    if (this.isUiBlocked()) return false;
    if (slot < 0 || slot >= SKILL_HOTBAR_SIZE) return false;
    if (this.queuedSkill === slot) {
      this.queuedSkill = null;
      return true;
    }
    const digit = SKILL_CODES[slot];
    const pad = SKILL_NUMPAD[slot];
    if (!digit || !pad) return false;
    const padFace = SKILL_PAD_FACE[slot];
    return this.consume(digit) || this.consume(pad) || (padFace ? this.consumePad(padFace) : false);
  }

  consumeAutoAttackToggle(): boolean {
    if (this.isUiBlocked()) return false;
    return this.consume('KeyF') || this.consumePad('l3');
  }
}
