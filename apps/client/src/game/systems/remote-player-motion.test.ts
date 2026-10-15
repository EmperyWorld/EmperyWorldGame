import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Math: {
  Linear: (a: number, b: number, t: number) => a + (b - a) * t,
  Clamp: (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n)),
} } }));
import { RemotePlayerManager } from './RemotePlayerManager.js';

function fixture() {
  const anims = { isPlaying: true, currentAnim: { key: '' }, stop: vi.fn() };
  const sprite = {
    x: 100, y: 100, depth: 100, flipX: false, anims,
    setPosition(x: number, y: number) { this.x = x; this.y = y; },
    setFlipX(flip: boolean) { this.flipX = flip; }, setVisible: vi.fn(), setCrop: vi.fn(), setDepth: vi.fn(),
    play: vi.fn((key: string) => { anims.currentAnim = { key }; anims.isPlaying = true; }),
  };
  const view = { sprite, mount: null, mountLook: null, facing: 'right', lastDepthBucket: 25,
    target: { x: 100, y: 60, moving: true, race: 'human', gender: 'male', facing: 'right', hp: 100, maxHp: 100 },
    disconnectDeadlineMs: null, label: {setPosition:vi.fn(),setDepth:vi.fn()},
    selectRing: {setPosition:vi.fn(),setDepth:vi.fn()},
    hpBarBg: {setPosition:vi.fn(),setDepth:vi.fn(),setVisible:vi.fn()},
    hpBarFg: {setPosition:vi.fn(),setDepth:vi.fn(),setVisible:vi.fn(),width:36},
  };
  const manager = Object.create(RemotePlayerManager.prototype);
  Object.assign(manager, { players:new Map([['other',view]]),frame:0,scene:{anims:{exists:()=>true}},knownAnims:new Set(),missingAnims:new Set() });
  Object.assign(sprite, {getData:()=>undefined});
  return { manager, view, sprite };
}

describe('remote player motion', () => {
  it.each([30,60,144])('retains north facing after stopping and small corrections at %i FPS', fps => {
    const {manager,view,sprite}=fixture();
    manager.update(1000/fps);
    expect(view.facing).toBe('up');
    view.target.moving=false;
    for(let i=0;i<fps*2;i++) manager.update(1000/fps);
    expect(sprite.y).toBe(60);
    expect(sprite.anims.currentAnim.key).toBe('player-human-idle-up');
    for(let i=0;i<120;i++) {
      view.target.x=100+(i%2?-.2:.2);
      manager.update(1000/fps);
      expect(view.facing).toBe('up');
      expect(sprite.anims.currentAnim.key).toBe('player-human-idle-up');
    }
  });
  it('restarts a stopped animation with the same key after mounting', () => {
    const {manager,sprite}=fixture();
    manager.update(1000/60);
    sprite.anims.isPlaying=false;
    sprite.play.mockClear();
    manager.update(1000/60);
    expect(sprite.play).toHaveBeenCalledWith('player-human-walk-up',true);
  });
});
