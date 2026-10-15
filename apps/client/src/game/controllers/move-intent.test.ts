import { describe, expect, it } from 'vitest';
import { isClickMoveStuck, resolveMoveIntent } from './move-intent.js';

describe('resolveMoveIntent', () => {
  it('keeps slow analog input instead of promoting it to full speed',()=>{
    const r=resolveMoveIntent({axisX:0.25,axisY:0,click:null,playerX:0,playerY:0,arriveDistSq:144});
    expect(r.intent).toEqual({kind:'keyboard',vx:0.25,vy:0});
  });
  it('prefers keyboard over click', () => {
    const r = resolveMoveIntent({
      axisX: 1,
      axisY: 0,
      click: { x: 100, y: 100 },
      playerX: 0,
      playerY: 0,
      arriveDistSq: 144,
    });
    expect(r.intent.kind).toBe('keyboard');
    expect(r.cancelClickByKeyboard).toBe(true);
    expect(r.intent.vx).toBeCloseTo(1);
  });

  it('walks toward click and arrives', () => {
    const walk = resolveMoveIntent({
      axisX: 0,
      axisY: 0,
      click: { x: 100, y: 0 },
      playerX: 0,
      playerY: 0,
      arriveDistSq: 144,
    });
    expect(walk.intent.kind).toBe('click');
    expect(walk.intent.vx).toBeCloseTo(1);

    const done = resolveMoveIntent({
      axisX: 0,
      axisY: 0,
      click: { x: 5, y: 0 },
      playerX: 0,
      playerY: 0,
      arriveDistSq: 144,
    });
    expect(done.arrived).toBe(true);
    expect(done.intent.kind).toBe('none');
  });
});

describe('isClickMoveStuck', () => {
  it('flags tiny progress while click-active', () => {
    expect(isClickMoveStuck({ active: true, movedDist: 0.1, stuckThreshold: 0.4 })).toBe(true);
    expect(isClickMoveStuck({ active: true, movedDist: 2, stuckThreshold: 0.4 })).toBe(false);
    expect(isClickMoveStuck({ active: false, movedDist: 0, stuckThreshold: 0.4 })).toBe(false);
  });
});
