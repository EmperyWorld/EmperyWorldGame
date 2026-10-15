import Phaser from 'phaser';
import { decorCounterDuration } from '../game/systems/graphics-quality.js';
import { canBakeGraphics, type BakeRect } from './graphics-bake-limits.js';

export { canBakeGraphics } from './graphics-bake-limits.js';
export type { BakeRect } from './graphics-bake-limits.js';

export const GPU_DOT_KEY = 'gpu-decor-dot';
export const GPU_BIRD_KEY = 'gpu-decor-bird';
export const GPU_FLAG_KEY = 'gpu-decor-flag';

export type GpuMember = Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member>;

function canvasTex(
  scene: Phaser.Scene,
  key: string,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return key;
  draw(ctx, size);
  scene.textures.addCanvas(key, canvas);
  return key;
}

export function ensureGpuDotTexture(scene: Phaser.Scene): string {
  return canvasTex(scene, GPU_DOT_KEY, 16, (ctx, size) => {
    const r = size * 0.42;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

export function ensureGpuBirdTexture(scene: Phaser.Scene): string {
  return canvasTex(scene, GPU_BIRD_KEY, 32, (ctx, size) => {
    ctx.translate(size / 2, size / 2 + 2);
    ctx.strokeStyle = 'rgba(232,238,244,0.95)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.quadraticCurveTo(-4, 6, 0, 2);
    ctx.quadraticCurveTo(4, 6, 12, -2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(247,250,252,1)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,160,32,1)';
    ctx.beginPath();
    ctx.moveTo(5, 2.5);
    ctx.lineTo(9, 3.2);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
  });
}

export function ensureGpuFlagTexture(scene: Phaser.Scene): string {
  return canvasTex(scene, GPU_FLAG_KEY, 32, (ctx) => {
    ctx.fillStyle = 'rgba(176,32,40,0.9)';
    ctx.beginPath();
    ctx.moveTo(4, 6);
    ctx.lineTo(28, 12);
    ctx.lineTo(4, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(212,160,80,0.85)';
    ctx.beginPath();
    ctx.arc(14, 12, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function createGpuDecorLayer(
  scene: Phaser.Scene,
  textureKey: string,
  size: number,
  depth: number,
): Phaser.GameObjects.SpriteGPULayer | null {
  try {
    const layer = scene.add.spriteGPULayer(textureKey, Math.max(1, size));
    layer.setDepth(depth);
    return layer;
  } catch {
    return null;
  }
}

export function addGpuMembers(
  layer: Phaser.GameObjects.SpriteGPULayer,
  members: readonly GpuMember[],
): void {
  const slot: GpuMember = {};
  for (const src of members) {
    slot.x = src.x ?? 0;
    slot.y = src.y ?? 0;
    slot.rotation = src.rotation ?? 0;
    slot.scaleX = src.scaleX ?? 1;
    slot.scaleY = src.scaleY ?? 1;
    slot.originX = src.originX ?? 0.5;
    slot.originY = src.originY ?? 0.5;
    slot.alpha = src.alpha ?? 1;
    slot.frame = src.frame ?? 0;
    slot.scrollFactorX = src.scrollFactorX ?? 1;
    slot.scrollFactorY = src.scrollFactorY ?? 1;
    slot.tintTopLeft = src.tintTopLeft;
    slot.tintTopRight = src.tintTopRight;
    slot.tintBottomLeft = src.tintBottomLeft;
    slot.tintBottomRight = src.tintBottomRight;
    slot.tintBlend = src.tintBlend ?? 1;
    layer.addMember(slot);
  }
}

function tintAll(color: number): Pick<
  GpuMember,
  'tintTopLeft' | 'tintTopRight' | 'tintBottomLeft' | 'tintBottomRight' | 'tintBlend'
> {
  return {
    tintTopLeft: color,
    tintTopRight: color,
    tintBottomLeft: color,
    tintBottomRight: color,
    tintBlend: 1,
  };
}

function looping(duration: number): boolean {
  return decorCounterDuration(duration) != null;
}

/** Soft puffs rising from chimneys / vents / stove. */
export function spawnGpuPuffs(
  scene: Phaser.Scene,
  stacks: ReadonlyArray<{ x: number; y: number; rise: number }>,
  opts: { color: number; depth: number; duration: number; puffs?: number; alpha?: number },
): boolean {
  if (stacks.length === 0) return false;
  ensureGpuDotTexture(scene);
  const puffs = opts.puffs ?? 3;
  const layer = createGpuDecorLayer(scene, GPU_DOT_KEY, stacks.length * puffs, opts.depth);
  if (!layer) return false;
  const live = looping(opts.duration);
  const members: GpuMember[] = [];
  const a0 = opts.alpha ?? 0.16;
  for (let i = 0; i < stacks.length; i++) {
    const c = stacks[i]!;
    for (let p = 0; p < puffs; p++) {
      const delay = (i * 220 + p * 380) % Math.max(200, opts.duration);
      const scale = 0.55 + p * 0.22;
      members.push({
        x: live
          ? {
              base: c.x,
              amplitude: 4 + p * 2,
              duration: opts.duration,
              delay,
              yoyo: true,
              loop: true,
              ease: 'Sine.easeInOut',
            }
          : c.x,
        y: live
          ? {
              base: c.y,
              amplitude: -c.rise,
              duration: opts.duration,
              delay,
              yoyo: false,
              loop: true,
              ease: 'Sine.easeOut',
            }
          : c.y - c.rise * 0.35,
        scaleX: live
          ? { base: scale, amplitude: 0.55, duration: opts.duration, delay, yoyo: false, loop: true }
          : scale * 1.2,
        scaleY: live
          ? { base: scale, amplitude: 0.55, duration: opts.duration, delay, yoyo: false, loop: true }
          : scale * 1.2,
        alpha: live
          ? { base: a0, amplitude: -a0, duration: opts.duration, delay, yoyo: false, loop: true }
          : a0 * 0.7,
        ...tintAll(opts.color),
      });
    }
  }
  addGpuMembers(layer, members);
  return true;
}

export function spawnGpuGlowDots(
  scene: Phaser.Scene,
  points: ReadonlyArray<{ x: number; y: number }>,
  opts: {
    color: number;
    depth: number;
    duration: number;
    scale?: number;
    alpha?: number;
    yOffset?: number;
  },
): boolean {
  if (points.length === 0) return false;
  ensureGpuDotTexture(scene);
  const layer = createGpuDecorLayer(scene, GPU_DOT_KEY, points.length, opts.depth);
  if (!layer) return false;
  const live = looping(opts.duration);
  const scale = opts.scale ?? 2.4;
  const alpha = opts.alpha ?? 0.22;
  const yOff = opts.yOffset ?? -8;
  addGpuMembers(
    layer,
    points.map((p, i) => ({
      x: p.x,
      y: p.y + yOff,
      scaleX: live
        ? {
            base: scale,
            amplitude: 0.45,
            duration: opts.duration,
            delay: i * 40,
            yoyo: true,
            loop: true,
            ease: 'Sine.easeInOut',
          }
        : scale,
      scaleY: live
        ? {
            base: scale,
            amplitude: 0.45,
            duration: opts.duration,
            delay: i * 40,
            yoyo: true,
            loop: true,
            ease: 'Sine.easeInOut',
          }
        : scale,
      alpha: live
        ? {
            base: alpha,
            amplitude: alpha * 0.4,
            duration: opts.duration,
            delay: i * 40,
            yoyo: true,
            loop: true,
            ease: 'Sine.easeInOut',
          }
        : alpha,
      ...tintAll(opts.color),
    })),
  );
  return true;
}

export function spawnGpuDriftDots(
  scene: Phaser.Scene,
  points: ReadonlyArray<{ x: number; y: number; r?: number }>,
  opts: {
    color: number;
    depth: number;
    duration: number;
    xAmp?: number;
    yAmp?: number;
    alpha?: number;
  },
): boolean {
  if (points.length === 0) return false;
  ensureGpuDotTexture(scene);
  const layer = createGpuDecorLayer(scene, GPU_DOT_KEY, points.length, opts.depth);
  if (!layer) return false;
  const live = looping(opts.duration);
  const xAmp = opts.xAmp ?? 18;
  const yAmp = opts.yAmp ?? 12;
  const alpha = opts.alpha ?? 0.14;
  addGpuMembers(
    layer,
    points.map((p, i) => ({
      x: live
        ? {
            base: p.x,
            amplitude: xAmp,
            duration: opts.duration,
            delay: i * 90,
            yoyo: true,
            loop: true,
            ease: 'Sine.easeInOut',
          }
        : p.x,
      y: live
        ? {
            base: p.y,
            amplitude: yAmp,
            duration: Math.round(opts.duration * 1.1),
            delay: i * 70,
            yoyo: true,
            loop: true,
            ease: 'Sine.easeInOut',
          }
        : p.y,
      scaleX: (p.r ?? 1.4) * 0.35,
      scaleY: (p.r ?? 1.4) * 0.35,
      alpha,
      ...tintAll(opts.color),
    })),
  );
  return true;
}

export function spawnGpuBirds(
  scene: Phaser.Scene,
  birds: ReadonlyArray<{ x: number; y: number; s: number; sc?: number }>,
  opts: { depth: number; duration: number; yLift?: number; xAmp?: number; yAmp?: number },
): boolean {
  if (birds.length === 0) return false;
  ensureGpuBirdTexture(scene);
  const layer = createGpuDecorLayer(scene, GPU_BIRD_KEY, birds.length, opts.depth);
  if (!layer) return false;
  const live = looping(opts.duration);
  const lift = opts.yLift ?? 72;
  const xAmp = opts.xAmp ?? 40;
  const yAmp = opts.yAmp ?? 14;
  addGpuMembers(
    layer,
    birds.map((b, i) => {
      const sc = b.sc ?? 1;
      return {
        x: live
          ? {
              base: b.x,
              amplitude: xAmp * b.s,
              duration: opts.duration,
              delay: i * 80,
              yoyo: true,
              loop: true,
              ease: 'Sine.easeInOut',
            }
          : b.x,
        y: live
          ? {
              base: b.y - lift,
              amplitude: yAmp,
              duration: Math.round(opts.duration * 0.7),
              delay: i * 60,
              yoyo: true,
              loop: true,
              ease: 'Sine.easeInOut',
            }
          : b.y - lift,
        scaleX: sc * b.s,
        scaleY: live
          ? {
              base: sc,
              amplitude: 0.12,
              duration: 320,
              delay: i * 40,
              yoyo: true,
              loop: true,
              ease: 'Sine.easeInOut',
            }
          : sc,
        alpha: 0.95,
      };
    }),
  );
  return true;
}

export function spawnGpuFlags(
  scene: Phaser.Scene,
  poles: ReadonlyArray<{ x: number; y: number }>,
  opts: { depth: number; duration: number },
): boolean {
  if (poles.length === 0) return false;
  ensureGpuFlagTexture(scene);
  const layer = createGpuDecorLayer(scene, GPU_FLAG_KEY, poles.length, opts.depth);
  if (!layer) return false;
  const live = looping(opts.duration);
  addGpuMembers(
    layer,
    poles.map((p, i) => ({
      x: p.x + 12,
      y: p.y - 22,
      originX: 0,
      originY: 0.5,
      rotation: live
        ? {
            base: 0,
            amplitude: 0.18,
            duration: opts.duration,
            delay: i * 70,
            yoyo: true,
            loop: true,
            ease: 'Sine.easeInOut',
          }
        : 0,
      scaleX: live
        ? {
            base: 1,
            amplitude: 0.08,
            duration: opts.duration,
            delay: i * 70,
            yoyo: true,
            loop: true,
            ease: 'Sine.easeInOut',
          }
        : 1,
      scaleY: 1,
      alpha: 0.9,
    })),
  );
  return true;
}

export function spawnGpuAmbientMotes(
  scene: Phaser.Scene,
  count: number,
  mapW: number,
  mapH: number,
  color: number,
  alpha: number,
  depth: number,
): Phaser.GameObjects.SpriteGPULayer | null {
  if (count <= 0) return null;
  ensureGpuDotTexture(scene);
  const layer = createGpuDecorLayer(scene, GPU_DOT_KEY, count, depth);
  if (!layer) return null;
  const members: GpuMember[] = [];
  for (let i = 0; i < count; i++) {
    const x = 40 + ((i * 97) % Math.max(1, mapW - 80));
    const y = 40 + ((i * 53) % Math.max(1, mapH - 80));
    members.push({
      x: {
        base: x,
        amplitude: 50,
        duration: 3200 + (i % 7) * 180,
        delay: i * 40,
        yoyo: true,
        loop: true,
        ease: 'Sine.easeInOut',
      },
      y: {
        base: y,
        amplitude: -48,
        duration: 3800 + (i % 5) * 160,
        delay: i * 55,
        yoyo: false,
        loop: true,
        ease: 'Sine.easeOut',
      },
      scaleX: 0.28 + (i % 3) * 0.08,
      scaleY: 0.28 + (i % 3) * 0.08,
      alpha: {
        base: alpha,
        amplitude: -alpha,
        duration: 3000 + (i % 4) * 200,
        delay: i * 30,
        yoyo: false,
        loop: true,
      },
      ...tintAll(color),
    });
  }
  addGpuMembers(layer, members);
  return layer;
}

/**
 * Bake a static Graphics into one Image.
 * Callers pass world AABB — Graphics has no GetBounds mixin, so Phaser.Display.Bounds.GetBounds is empty.
 */
export function bakeStaticGraphics(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  key: string,
  bounds: BakeRect,
): Phaser.GameObjects.GameObject {
  if (!canBakeGraphics(bounds.width, bounds.height)) return g;
  try {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const w = Math.max(4, Math.ceil(bounds.width));
    const h = Math.max(4, Math.ceil(bounds.height));
    const tex = scene.textures.addDynamicTexture(key, w, h, false);
    if (!tex) return g;
    tex.camera.setSize(w, h);
    tex.camera.scrollX = bounds.x;
    tex.camera.scrollY = bounds.y;
    tex.clear();
    tex.draw(g);
    tex.render();
    const depth = g.depth;
    const blend = g.blendMode;
    const img = scene.add
      .image(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, key)
      .setDepth(depth);
    img.setBlendMode(blend);
    g.destroy();
    return img;
  } catch {
    return g;
  }
}
