import { describe, expect, it, vi } from 'vitest';
import { CityActorAnimation } from './city-actor-animation.js';

function sprite(up = true) {
  return { texture: { has: (frame: string) => up || !frame.includes('-up-') }, anims: { isPlaying: true, stop: vi.fn() }, setFrame: vi.fn(), setFlipX: vi.fn() };
}
describe('city actor steps', () => {
  it('cycles walking frames from actual travel for bard and audience looks', () => {
    for (const prefix of ['npc-town_scribe', 'npc-town_merchant']) {
      const actor = sprite(), animation = new CityActorAnimation(prefix);
      for (let i = 0; i < 6; i++) animation.update(actor, 3, 0, 64);
      expect(new Set(actor.setFrame.mock.calls.map(([frame]) => frame)).size).toBe(3);
      animation.update(actor, 0, 0, 64);
      expect(actor.setFrame).toHaveBeenLastCalledWith(`${prefix}-0`);
    }
  });
  it('faces north while walking away, then stays still when blocked', () => {
    const actor = sprite(), animation = new CityActorAnimation('npc-town_scribe');
    animation.update(actor, 0, -7, 100);
    expect(actor.setFrame).toHaveBeenLastCalledWith('npc-town_scribe-up-2');
    animation.update(actor, 0, 0, 100);
    expect(actor.setFrame).toHaveBeenLastCalledWith('npc-town_scribe-up-0');
  });
  it('falls back to available walking frames and faces west', () => {
    const actor = sprite(false), animation = new CityActorAnimation('npc-town_healer');
    animation.update(actor, -8, -8, 100);
    expect(actor.setFrame).toHaveBeenLastCalledWith('npc-town_healer-3');
    expect(actor.setFlipX).toHaveBeenLastCalledWith(true);
  });
});
