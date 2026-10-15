import { describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ pickupLoot: vi.fn(), fetchSurvival: vi.fn(), offerBreadToSeagull: vi.fn() }));
vi.mock('../../api.js', () => api);
vi.mock('phaser', () => ({ default: {} }));
import { GameplaySession } from './GameplaySession.js';

function fixture() {
  // Exercise the session's asynchronous lifecycle without creating a renderer.
  const session = Object.create(GameplaySession.prototype);
  const callbacks = { onSaveUpdate: vi.fn(), onCombatFeedback: vi.fn() };
  Object.assign(session, {
    sceneGeneration: 1, save: { id: 'save-1' }, pickupBusy: false,
    scene: { registry: { get: () => callbacks } },
    groundLoot: { remove: vi.fn() }, companionSprite: { setCompanion: vi.fn() },
    playerCtrl: { x: 10, y: 20 },
    updateSave: vi.fn(), applyWorldTime: vi.fn(), hasBreadLoaf: () => true,
  });
  return { session, callbacks };
}
describe('gameplay session request lifecycle', () => {
  it('resets the previous scene burst edge when starting another scene',()=>{
    const {session}=fixture();
    session.realtimeInput={lastAt:100,lastSent:{x:10,y:20,moving:true,facing:'left',dash:true}};
    session.dayNightOverlay={setProfile:vi.fn()};
    session.begin({save:{id:'save-2'},stats:{},location:{id:'adena_fields',spawn:{x:100,y:200}}});
    expect(session.realtimeInput.lastSent).toEqual({x:100,y:200,moving:false,facing:'right',dash:false});
  });
  it('drops late loot results without releasing a newer pickup lock', async () => {
    const { session, callbacks } = fixture();
    let complete!: (value: unknown) => void;
    api.pickupLoot.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const pending = session.tryPickupLoot('loot-old');
    session.sceneGeneration++;
    session.pickupBusy = true;
    complete({ save: { id: 'save-1' }, stats: {}, summary: 'old loot' });
    await pending;
    expect(session.updateSave).not.toHaveBeenCalled();
    expect(callbacks.onSaveUpdate).not.toHaveBeenCalled();
    expect(session.groundLoot.remove).not.toHaveBeenCalled();
    expect(session.pickupBusy).toBe(true);
  });
  it('drops old environment responses after travel', async () => {
    const { session } = fixture();
    let complete!: (value: unknown) => void;
    api.fetchSurvival.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const pending = session.syncDayNight();
    session.sceneGeneration++;
    complete({ environment: { timeOfDay: { hour: 12 } } });
    await pending;
    expect(session.applyWorldTime).not.toHaveBeenCalled();
  });
  it('does not update the next scene with an old companion interaction', async () => {
    const { session, callbacks } = fixture();
    let complete!: (value: unknown) => void;
    api.offerBreadToSeagull.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const pending = session.tryOfferBread('gull-1');
    session.sceneGeneration++;
    complete({ save: {}, stats: {}, tamed: true, message: 'tamed' });
    await pending;
    expect(session.updateSave).not.toHaveBeenCalled();
    expect(session.companionSprite.setCompanion).not.toHaveBeenCalled();
    expect(callbacks.onCombatFeedback).not.toHaveBeenCalled();
  });
});
