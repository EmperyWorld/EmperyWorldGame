import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./settings-store.js', () => ({ LEGACY_UI_AUDIO_MUTED_STORAGE_KEY: 'muted', getClientSetting: () => false, setClientSetting: vi.fn() }));
const node = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: { value: 0 }, frequency: { value: 0 }, Q: { value: 0 } });
function audioWindow() {
  const contexts: Array<{ state: string; createBufferSource: ReturnType<typeof vi.fn>; createGain: ReturnType<typeof vi.fn> }> = [];
  class Context {
    state = 'suspended'; currentTime = 0; sampleRate = 1000; destination = {};
    createBufferSource = vi.fn(node); createGain = vi.fn(node); createBiquadFilter = vi.fn(node);
    createBuffer = vi.fn((_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }));
    resume = vi.fn(async () => { this.state = 'running'; });
    constructor() { contexts.push(this); }
  }
  vi.stubGlobal('window', { AudioContext: Context });
  return contexts;
}
beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('stage audio after browser unlock', () => {
  it('plays timed applause through the context already unlocked by the player', async () => {
    const contexts = audioWindow();
    const ui = await import('./ui-audio.js');
    const stage = await import('./stage-audio.js');
    ui.unlockUiAudio();
    await Promise.resolve();
    stage.playStageApplause(1700, { sourceX: 0, sourceY: 0, listenerX: 50, listenerY: 50 });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.state).toBe('running');
    // One unlock buffer, 44 staggered claps, and the crowd wash.
    expect(contexts[0]!.createBufferSource).toHaveBeenCalledTimes(46);
    expect(contexts[0]!.createGain.mock.results[1]!.value.gain.value).toBe(0.55);
  });
  it('does not create audio for a distant or muted listener', async () => {
    const contexts = audioWindow();
    const ui = await import('./ui-audio.js');
    const stage = await import('./stage-audio.js');
    stage.playStageApplause(1700, { sourceX: 0, sourceY: 0, listenerX: 1000, listenerY: 0 });
    ui.setUiAudioMuted(true);
    stage.playStageApplause();
    expect(contexts).toHaveLength(0);
  });
  it('keeps full volume nearby and fades to silence outside the theatre', async () => {
    const { stageHearGain } = await import('./stage-audio.js');
    const spatial = { sourceX: 0, sourceY: 0, listenerX: 0, listenerY: 0 };
    expect(stageHearGain(spatial)).toBe(1);
    expect(stageHearGain({ ...spatial, listenerX: 380 })).toBeCloseTo(0.25);
    expect(stageHearGain({ ...spatial, listenerX: 560 })).toBe(0);
  });
});
