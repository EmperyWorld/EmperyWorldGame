/** Procedural punch thud for the harbor brawl — same Web Audio family as stage applause. */
import { HAVEN_HARBOR_BRAWL_HIT_SFX } from '@empery/shared';
import { stageHearGain, type StageApplauseSpatial } from './stage-audio.js';
import { getSharedAudioContext, isUiAudioMuted } from './ui-audio.js';

let hits = 0;

export function harborBrawlHitCount(): number {
  return hits;
}

export function playHarborBrawlHit(spatial?: StageApplauseSpatial): void {
  if (isUiAudioMuted()) return;
  const hear = spatial ? stageHearGain(spatial) : 1;
  if (hear <= 0.02) return;

  const c = getSharedAudioContext();
  if (!c) return;

  const run = (): void => {
    if (c.state !== 'running') return;
    hits += 1;
    const w = window as Window & {
      __EMPERY_HARBOR__?: Record<string, unknown>;
    };
    if (w.__EMPERY_HARBOR__) {
      w.__EMPERY_HARBOR__.hitSfx = HAVEN_HARBOR_BRAWL_HIT_SFX;
      w.__EMPERY_HARBOR__.brawlHitCount = hits;
      w.__EMPERY_HARBOR__.lastBrawlHitAt = Date.now();
    }

    const bus = c.createGain();
    bus.gain.value = 0.55 * hear;
    bus.connect(c.destination);
    const t0 = c.currentTime + 0.01;

    const thud = c.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(118 + Math.random() * 28, t0);
    thud.frequency.exponentialRampToValueAtTime(52, t0 + 0.09);
    const tg = c.createGain();
    tg.gain.setValueAtTime(0.0001, t0);
    tg.gain.exponentialRampToValueAtTime(0.9, t0 + 0.008);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    thud.connect(tg);
    tg.connect(bus);
    thud.start(t0);
    thud.stop(t0 + 0.13);

    const dur = 0.038 + Math.random() * 0.02;
    const frames = Math.max(24, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      const t = i / frames;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 18);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 700;
    bp.Q.value = 0.9;
    const ng = c.createGain();
    ng.gain.value = 0.35;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  };

  if (c.state === 'suspended') {
    void c.resume().then(run).catch(() => { /* Wait for the next user gesture. */ });
    return;
  }
  run();
}
