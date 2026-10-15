import { describe, expect, it } from 'vitest';
import { InputManager } from './InputManager.js';

function stubDocument(): void {
  Object.defineProperty(globalThis, 'document', {
    value: { activeElement: null },
    configurable: true,
  });
}

describe('InputManager.queueSkill', () => {
  it('consumes a HUD-queued slot once', () => {
    stubDocument();
    const input = new InputManager();
    input.queueSkill(2);
    expect(input.consumeSkill(0)).toBe(false);
    expect(input.consumeSkill(2)).toBe(true);
    expect(input.consumeSkill(2)).toBe(false);
  });

  it('drops the queue when UI is blocked', () => {
    stubDocument();
    const input = new InputManager();
    input.queueSkill(1);
    input.setUiBlocked(true);
    expect(input.consumeSkill(1)).toBe(false);
    input.setUiBlocked(false);
    expect(input.consumeSkill(1)).toBe(false);
  });
});
