/** Procedural crowd applause for the Haven stage (no asset files). */
import { getSharedAudioContext, isUiAudioMuted } from './ui-audio.js';

export type StageApplauseSpatial = {
  sourceX: number;
  sourceY: number;
  listenerX: number;
  listenerY: number;
  /** Full volume inside this radius (world px). */
  innerRadius?: number;
  /** Silent outside this radius (world px). */
  outerRadius?: number;
};

/** 1 at/inside inner, 0 at/beyond outer — smooth quadratic falloff between. */
export function stageHearGain(spatial: StageApplauseSpatial): number {
  const inner = spatial.innerRadius ?? 200;
  const outer = Math.max(inner + 1, spatial.outerRadius ?? 560);
  const d = Math.hypot(spatial.listenerX - spatial.sourceX, spatial.listenerY - spatial.sourceY);
  if (d <= inner) return 1;
  if (d >= outer) return 0;
  const t = (d - inner) / (outer - inner);
  const u = 1 - t;
  return u * u;
}

function clapBurst(c: AudioContext, dest: AudioNode, when: number, gain: number): void {
  const dur = 0.045 + Math.random() * 0.04;
  const frames = Math.max(32, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const env = Math.exp(-t * 14) * (1 - t * 0.35);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200 + Math.random() * 1800;
  bp.Q.value = 0.7 + Math.random() * 0.8;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(when);
  src.stop(when + dur + 0.02);
}

/**
 * Soft staggered claps, attenuated by distance to the stage.
 * No play (and no unlock noise) when listener is outside outerRadius.
 */
export function playStageApplause(
  durationMs = 1600,
  spatial?: StageApplauseSpatial,
): void {
  const hear = spatial ? stageHearGain(spatial) : 1;
  if (!Number.isFinite(hear) || hear <= 0.02 || isUiAudioMuted()) return;

  const c = getSharedAudioContext();
  if (!c) return;

  const run = () => {
    if (c.state !== 'running') return;
    const bus = c.createGain();
    // Peak loudness scaled by distance (full ≈ 0.45 master equivalent).
    bus.gain.value = 0.55 * hear;
    bus.connect(c.destination);

    const t0 = c.currentTime + 0.02;
    const end = durationMs / 1000;
    const count = 44;
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const when = t0 + u * u * end * 0.85 + Math.random() * 0.05;
      const gain = (0.13 + Math.random() * 0.08) * (1 - u * 0.45);
      clapBurst(c, bus, when, gain);
    }

    const washFrames = Math.floor(c.sampleRate * 0.55);
    const washBuf = c.createBuffer(1, washFrames, c.sampleRate);
    const washData = washBuf.getChannelData(0);
    for (let i = 0; i < washFrames; i++) {
      const t = i / washFrames;
      washData[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * 0.15;
    }
    const wash = c.createBufferSource();
    wash.buffer = washBuf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const wg = c.createGain();
    wg.gain.value = 0.028;
    wash.connect(lp);
    lp.connect(wg);
    wg.connect(bus);
    wash.start(t0);
    wash.stop(t0 + 0.55);
  };

  if (c.state === 'suspended') {
    void c.resume().then(run).catch(() => { /* Wait for the next user gesture. */ });
    return;
  }
  run();
}
