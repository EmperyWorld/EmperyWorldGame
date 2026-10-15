/** Soft procedural cues for Survival-Life thresholds (no asset dependency). */
import { getClientSetting } from './settings-store.js';

export function playSurvivalBreathCue(severity: 'deficit' | 'critical'): void {
  if (typeof window === 'undefined') return;
  if (getClientSetting('survivalFxReduced')) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Soft breath-like noise + low tone.
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.45), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      const envelope = Math.sin(Math.PI * t);
      data[i] = (Math.random() * 2 - 1) * envelope * (severity === 'critical' ? 0.22 : 0.12);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = severity === 'critical' ? 0.035 : 0.02;
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = severity === 'critical' ? 165 : 210;
    oscGain.gain.value = severity === 'critical' ? 0.03 : 0.018;
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    noise.start(now);
    osc.start(now);
    noise.stop(now + 0.5);
    osc.stop(now + 0.55);
    window.setTimeout(() => {
      void ctx.close();
    }, 700);
  } catch {
    /* audio optional */
  }
}
