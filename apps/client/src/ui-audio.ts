/** Soft Web Audio UI cues — no asset files required. */

import {
  LEGACY_UI_AUDIO_MUTED_STORAGE_KEY,
  getClientSetting,
  setClientSetting,
} from './settings-store.js';

type UiCue = 'open' | 'close' | 'toast' | 'tick';

export const UI_AUDIO_MUTED_STORAGE_KEY = LEGACY_UI_AUDIO_MUTED_STORAGE_KEY;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** World cues reuse the context unlocked by a real click or key press. */
export function getSharedAudioContext(): AudioContext | null {
  return getCtx();
}

/**
 * Must run inside a user-gesture call stack (click / keydown).
 * Starts resume() synchronously so the browser grants audio.
 */
export function unlockUiAudio(): void {
  const c = getCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume();
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start(0);
  } catch {
    /* ignore */
  }
}

export function setUiAudioMuted(next: boolean): void {
  muted = next;
  setClientSetting('uiAudioMuted', next);
}

export function isUiAudioMuted(): boolean {
  return muted;
}

export function applyUiAudioPrefs(): void {
  muted = getClientSetting('uiAudioMuted');
}

function tone(
  c: AudioContext,
  freq: number,
  durationMs: number,
  gain = 0.35,
  type: OscillatorType = 'sine',
  delayMs = 0,
): void {
  if (!master) return;
  const t0 = c.currentTime + delayMs / 1000;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.linearRampToValueAtTime(gain * 0.55, t0 + (durationMs / 1000) * 0.45);
  g.gain.linearRampToValueAtTime(0, t0 + durationMs / 1000);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.03);
}

function emit(c: AudioContext, cue: UiCue): void {
  switch (cue) {
    case 'open':
      tone(c, 330, 90, 0.5, 'triangle');
      tone(c, 494, 110, 0.4, 'sine', 45);
      break;
    case 'close':
      tone(c, 440, 70, 0.45, 'triangle');
      tone(c, 294, 100, 0.36, 'sine', 40);
      break;
    case 'toast':
      tone(c, 620, 70, 0.48, 'sine');
      tone(c, 830, 90, 0.38, 'triangle', 35);
      break;
    case 'tick':
      tone(c, 520, 40, 0.32, 'square');
      break;
  }
}

export function playUiCue(cue: UiCue): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;

  const play = () => {
    if (c.state !== 'running') return;
    emit(c, cue);
  };

  // Resume synchronously in the gesture stack, then play when ready.
  if (c.state === 'suspended') {
    void c.resume().then(play);
    return;
  }
  play();
}

export function bindUiAudioUnlock(): void {
  const arm = () => unlockUiAudio();
  window.addEventListener('pointerdown', arm, { capture: true, passive: true });
  window.addEventListener('keydown', arm, { capture: true });
}
