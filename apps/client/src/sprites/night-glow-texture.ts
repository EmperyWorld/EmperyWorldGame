import type Phaser from 'phaser';
const KEY = 'night-soft-glow-v1';

/** One cached procedural texture gives every lamp a smooth edge without per-frame drawing. */
export function ensureNightGlowTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(KEY)) return KEY;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return KEY;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  scene.textures.addCanvas(KEY, canvas);
  return KEY;
}
