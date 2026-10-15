/** Pure move intent resolution — keyboard beats click-to-move. */

export type MoveIntentKind = 'keyboard' | 'click' | 'none';

export interface MoveIntent {
  kind: MoveIntentKind;
  /** Direction with magnitude at most 1; analog input retains its throttle. */
  vx: number;
  vy: number;
}

export interface ResolveMoveIntentInput {
  axisX: number;
  axisY: number;
  click: { x: number; y: number } | null;
  playerX: number;
  playerY: number;
  arriveDistSq: number;
}

export interface ResolveMoveIntentResult {
  intent: MoveIntent;
  /** Click destination reached this frame. */
  arrived: boolean;
  /** Keyboard took over — drop click target. */
  cancelClickByKeyboard: boolean;
}

export function resolveMoveIntent(input: ResolveMoveIntentInput): ResolveMoveIntentResult {
  const { axisX, axisY, click, playerX, playerY, arriveDistSq } = input;
  if (axisX !== 0 || axisY !== 0) {
    const len = Math.max(1, Math.hypot(axisX, axisY));
    return {
      intent: { kind: 'keyboard', vx: axisX / len, vy: axisY / len },
      arrived: false,
      cancelClickByKeyboard: click != null,
    };
  }
  if (click) {
    const dx = click.x - playerX;
    const dy = click.y - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq <= arriveDistSq) {
      return {
        intent: { kind: 'none', vx: 0, vy: 0 },
        arrived: true,
        cancelClickByKeyboard: false,
      };
    }
    const len = Math.sqrt(distSq) || 1;
    return {
      intent: { kind: 'click', vx: dx / len, vy: dy / len },
      arrived: false,
      cancelClickByKeyboard: false,
    };
  }
  return {
    intent: { kind: 'none', vx: 0, vy: 0 },
    arrived: false,
    cancelClickByKeyboard: false,
  };
}

/** True when click-move made almost no progress this frame. */
export function isClickMoveStuck(opts: {
  active: boolean;
  movedDist: number;
  stuckThreshold: number;
}): boolean {
  return opts.active && opts.movedDist < opts.stuckThreshold;
}
