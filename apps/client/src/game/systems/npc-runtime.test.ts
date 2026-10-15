import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HavenNpcScheduleEntry, HavenScheduleSnapshot } from '@empery/shared';
const world = vi.hoisted(() => ({ blocked: false, revision: 0, shortened: false, groundBlocked: false }));
vi.mock('../../sprites/sprite-factory.js', () => ({ npcIdleAnimKey: (id: string) => `${id}-idle`, npcWalkAnimKey: (id: string) => `${id}-walk` }));
vi.mock('../../sprites/npc-catalog.js', () => ({ npcWorldDef: () => null }));
vi.mock('../../sprites/visual-polish.js', () => ({ entityDepth: (y: number) => y, syncEntityShadow: vi.fn() }));
vi.mock('../../sprites/npc-pathing.js', () => ({
  clearNpcRouteCache: vi.fn(),
  buildNpcRoute: vi.fn((_scene: unknown, x: number, y: number, tx: number, ty: number) => world.blocked ? [] : [{ x, y }, { x: world.shortened ? tx - 150 : tx, y: ty }]),
}));
vi.mock('../../sprites/prop-colliders.js', () => ({
  propCollisionRevision: () => world.revision, isInsidePropAabb: () => false,
  nudgePointFromPropColliders: (_scene: unknown, x: number, y: number) => ({ x, y }),
}));
vi.mock('../../sprites/world-tiles.js', () => ({ isTileBlockedAt: () => world.groundBlocked }));
import { createNpcActor, npcActorInteractable, snapNpcActorsToSchedule, updateNpcActors, type NpcActorState } from './NpcRuntime.js';
import { buildNpcRoute } from '../../sprites/npc-pathing.js';

function fixture(x = 100, y = 130, id = 'test_npc') {
  const sprite = {
    x, y, active: true, visible: true, alpha: 1, scaleX: 1,
    scene: { anims: { exists: () => true }, data: new Map(), tweens: { killTweensOf: vi.fn() } },
    anims: { currentAnim: undefined as { key: string } | undefined, play(key: string) { this.currentAnim = { key }; } },
    setPosition(nx: number, ny: number) { this.x = nx; this.y = ny; return this; },
    setVisible(visible: boolean) { this.visible = visible; return this; },
    setAlpha(alpha: number) { this.alpha = alpha; return this; },
    clearTint: vi.fn(), setScale: vi.fn(), setFlipX: vi.fn(), setDepth: vi.fn(),
  };
  const actor = createNpcActor(id, sprite as unknown as Phaser.GameObjects.Sprite, 100, 130, { wanderRadius: 0, wanderSpeed: 36, sleepHomeX: 300, sleepHomeY: 100 });
  return { actor, sprite };
}
function schedule(phase: HavenNpcScheduleEntry['phase'], id = 'test_npc'): HavenScheduleSnapshot {
  return { npcs: [{ id, phase, mode: phase === 'at_home' || phase === 'walking_home' ? 'sleep' : 'day', x: 100, y: 130, asleep: phase === 'at_home', interactable: phase !== 'at_home' }] } as HavenScheduleSnapshot;
}
function advance(actor: NpcActorState, phase: HavenNpcScheduleEntry['phase'], seconds: number, fps = 60, talkingNpcId?: string) {
  const actors = [actor];
  for (let i = 0; i < seconds * fps; i++) updateNpcActors(actors, 1000 / fps, { schedule: schedule(phase), talkingNpcId });
}
beforeEach(() => { Object.assign(world, { blocked: false, revision: 0, shortened: false, groundBlocked: false }); vi.clearAllMocks(); });
describe('service NPC runtime', () => {
  it('uses the northbound walk animation when returning to a post from the south', () => {
    const { actor, sprite } = fixture(100, 200);
    advance(actor, 'walking_to_post', 0.3);
    expect(actor.walkNorth).toBe(true);
    expect(sprite.anims.currentAnim?.key).toBe('test_npc-walk-up');
  });
  it('keeps an indoor NPC hidden while its outdoor entrance is unavailable', () => {
    const { actor, sprite } = fixture();
    snapNpcActorsToSchedule([actor], schedule('at_home'));
    world.groundBlocked = true;
    world.revision++;
    advance(actor, 'at_post', 2);
    expect(actor.asleep).toBe(true);
    expect(sprite.visible).toBe(false);
    expect(actor.homeTransition).toBe('none');
    world.groundBlocked = false;
    world.revision++;
    advance(actor, 'at_post', 8);
    expect(sprite.visible).toBe(true);
    expect(sprite.x).toBeLessThan(116);
  });
  it('pauses a service NPC exit fade when its entrance becomes unavailable', () => {
    const { actor, sprite } = fixture();
    snapNpcActorsToSchedule([actor], schedule('at_home'));
    updateNpcActors([actor], 100, { schedule: schedule('at_post') });
    const pose = { x: sprite.x, y: sprite.y, alpha: sprite.alpha, progress: actor.homeProgress };
    world.groundBlocked = true;
    world.revision++;
    updateNpcActors([actor], 100, { schedule: schedule('at_post') });
    expect({ x: sprite.x, y: sprite.y, alpha: sprite.alpha, progress: actor.homeProgress }).toEqual(pose);
    world.groundBlocked = false;
    world.revision++;
    advance(actor, 'at_post', 8);
    expect(actor.homeTransition).toBe('none');
    expect(sprite.alpha).toBe(1);
    expect(sprite.x).toBeLessThan(116);
  });
  it('seeds a mid-commute join along its safe route rather than using a raw snapshot point', () => {
    const {actor,sprite}=fixture();
    const snapshot=schedule('walking_home');
    Object.assign(snapshot.npcs[0]!,{x:9999,y:9999,walkT:0.5});
    snapNpcActorsToSchedule([actor],snapshot);
    expect(sprite.x).toBe(200);
    expect(sprite.y).toBe(130);
    expect(sprite.setDepth).toHaveBeenLastCalledWith(130);
  });
  it.each([30, 60, 144])('retains a blocked night commute at %i FPS and enters after the gate opens', fps => {
    const { actor, sprite } = fixture();
    world.blocked = true;
    advance(actor, 'walking_home', 5, fps);
    advance(actor, 'at_home', 10, fps);
    expect(actor.asleep).toBe(false);
    expect(sprite.visible).toBe(true);
    expect(sprite.x).toBe(100);
    expect(npcActorInteractable(actor, schedule('at_home').npcs[0])).toBe(false);
    expect(vi.mocked(buildNpcRoute).mock.calls.length).toBeLessThan(12);
    world.blocked = false; world.revision++;
    advance(actor, 'at_home', 8, fps);
    expect(actor.asleep).toBe(true);
    expect(sprite.visible).toBe(false);
  });
  it('enters on arrival while the schedule still reports walking home', () => {
    const { actor, sprite } = fixture(300, 130);
    advance(actor, 'walking_home', 1);
    expect(actor.asleep).toBe(true);
    expect(sprite.visible).toBe(false);
    advance(actor, 'walking_home', 3);
    expect(actor.asleep).toBe(true);
    expect(sprite.visible).toBe(false);
  });
  it('keeps an entry fade continuous when the schedule switches to sleep', () => {
    const { actor, sprite } = fixture(300, 130);
    const actors = [actor];
    updateNpcActors(actors, 50, { schedule: schedule('at_home') });
    updateNpcActors(actors, 50, { schedule: schedule('at_home') });
    const alpha = sprite.alpha;
    updateNpcActors(actors, 50, { schedule: schedule('at_home') });
    expect(sprite.alpha).toBeLessThan(alpha);
    expect(sprite.visible).toBe(true);
    advance(actor, 'at_home', 1);
    expect(sprite.visible).toBe(false);
  });
  it('exits home and walks to a late morning work post without a teleport', () => {
    const { actor, sprite } = fixture();
    const night = schedule('at_home');
    night.npcs[0]!.x = 300; night.npcs[0]!.y = 100;
    snapNpcActorsToSchedule([actor], night);
    updateNpcActors([actor], 100, { schedule: schedule('at_post') });
    expect(actor.homeTransition).toBe('exiting');
    expect(sprite.alpha).toBeLessThan(1);
    expect(npcActorInteractable(actor, schedule('at_post').npcs[0])).toBe(false);
    advance(actor, 'at_post', 8);
    expect(Math.abs(sprite.x - 100)).toBeLessThanOrEqual(16);
    expect(sprite.visible).toBe(true);
  });
  it('walks toward a remote open post instead of snapping to it', () => {
    const { actor, sprite } = fixture(1000, 130);
    updateNpcActors([actor], 100, { schedule: schedule('open') });
    expect(sprite.x).toBeGreaterThan(990);
    expect(sprite.x).toBeLessThan(1000);
  });
  it('holds a commute conversation still and resumes its retained destination', () => {
    const { actor, sprite } = fixture();
    advance(actor, 'walking_home', 3, 60, actor.id);
    expect(sprite.x).toBe(100);
    advance(actor, 'walking_home', 1);
    expect(sprite.x).toBeGreaterThan(100);
    expect(sprite.visible).toBe(true);
  });
  it('does not slide a talking local NPC during personal space correction', () => {
    const a = fixture(100, 130, 'a'), b = fixture(105, 130, 'b');
    a.actor.wait = b.actor.wait = 10000;
    updateNpcActors([a.actor, b.actor], 200, { talkingNpcId: 'a' });
    expect(a.sprite.x).toBe(100);
    expect(a.sprite.y).toBe(130);
  });
  it('does not push a crowd onto blocked terrain', () => {
    const a = fixture(100, 130, 'a'), b = fixture(105, 130, 'b');
    a.actor.wait = b.actor.wait = 10000; world.groundBlocked = true;
    updateNpcActors([a.actor, b.actor], 200);
    expect(a.sprite.x).toBe(100);
    expect(b.sprite.x).toBe(105);
  });
});
