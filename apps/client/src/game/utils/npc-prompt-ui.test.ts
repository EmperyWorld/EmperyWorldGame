import { describe, expect, it } from 'vitest';
import { npcPromptLayout } from './npc-prompt-ui.js';

describe('npcPromptLayout', () => {
  it('follows the sprite instead of staying at spawn', () => {
    const spawn = npcPromptLayout(100, 200, 0);
    const moved = npcPromptLayout(400, 900, 0);
    expect(moved.labelX - spawn.labelX).toBe(300);
    expect(moved.markerX - spawn.markerX).toBe(300);
    expect(moved.markerY - spawn.markerY).toBe(700);
  });

  it('bobs the marker independently of the label', () => {
    const a = npcPromptLayout(10, 50, 0);
    const b = npcPromptLayout(10, 50, 350);
    expect(a.labelY).toBe(b.labelY);
    expect(a.markerY).not.toBe(b.markerY);
  });
});
