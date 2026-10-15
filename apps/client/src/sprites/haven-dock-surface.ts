/**
 * Haven dock floor: opaque stretcher-bond setts.
 *
 * Do not stamp `tile_haven_dock_*` WebPs. They load as `prop-*`, get
 * `cutDarkBackground`, and sit on a black/transparent RenderTexture — that is
 * the 64px black-square grid. Procedural bricks stay fully opaque.
 */
import Phaser from 'phaser';
import { HAVEN_HARBOR_STONE, havenHarborCopingEdges, type HavenTileRect } from '@empery/shared';
import { getWorldGameHour, subscribeHavenSchedule } from '../world-clock.js';
import { bakeRectFromBox } from './graphics-bake-limits.js';
import { bakeStaticGraphics } from './gpu-decor.js';
import { dockSettHash, HAVEN_DOCK_MORTAR, HAVEN_DOCK_STONE } from './haven-dock-sett.js';

const TW = 64;
const BRICK_W = 26;
const BRICK_H = 16;

export const HAVEN_DOCK_SETT_TILES = [
  'tile_haven_dock_a',
  'tile_haven_dock_b',
  'tile_haven_dock_c',
  'tile_haven_dock_d',
] as const;
export {
  chooseHavenDockSett,
  dockFillLuminance,
  dockSettHash,
  HAVEN_DOCK_MORTAR,
  HAVEN_DOCK_STONE,
} from './haven-dock-sett.js';

function paintCobbleRect(g: Phaser.GameObjects.Graphics, r: HavenTileRect): void {
  const x0 = r.tx * TW;
  const y0 = r.ty * TW;
  const w = r.w * TW;
  const h = r.h * TW;
  g.fillStyle(HAVEN_DOCK_MORTAR, 1);
  g.fillRect(x0, y0, w, h);
  let row = 0;
  for (let y = y0; y < y0 + h; y += BRICK_H, row++) {
    const offset = row % 2 === 0 ? 0 : Math.floor(BRICK_W / 2);
    for (let x = x0 - offset; x < x0 + w; x += BRICK_W) {
      const bx = Math.max(x0, x);
      const by = y;
      const bw = Math.min(x + BRICK_W - 1, x0 + w) - bx;
      const bh = Math.min(BRICK_H - 1, y0 + h - by);
      if (bw < 3 || bh < 3) continue;
      const color =
        HAVEN_DOCK_STONE[dockSettHash(Math.floor(x / BRICK_W), row + r.ty * 17, 7) % HAVEN_DOCK_STONE.length]!;
      g.fillStyle(color, 1);
      g.fillRect(bx, by, bw, bh);
    }
  }
}

function paintSettField(scene: Phaser.Scene): void {
  for (const r of HAVEN_HARBOR_STONE) {
    const stone = scene.add.graphics().setDepth(2);
    paintCobbleRect(stone, r);
    bakeStaticGraphics(
      scene,
      stone,
      `bake-haven-dock-sett-${r.tx}-${r.ty}`,
      bakeRectFromBox(r.tx * TW, r.ty * TW, r.w * TW, r.h * TW),
    );
  }
}

function paintCopingStrip(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  timber: boolean,
): void {
  g.fillStyle(timber ? 0x5a4634 : 0x4a4e54, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(0xc4a06a, 1);
  if (w >= h) {
    g.fillRect(x, y + Math.floor(h * 0.35), w, 2);
  } else {
    g.fillRect(x + Math.floor(w * 0.35), y, 2, h);
  }
}

function paintHavenDockCoping(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(2.2);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;
  const cap = 7;
  for (const e of havenHarborCopingEdges()) {
    const x = e.tx * TW;
    const y = e.ty * TW;
    if (e.dx === 1) paintCopingStrip(g, x + TW - cap, y, cap, TW, true);
    else if (e.dx === -1) paintCopingStrip(g, x, y, cap, TW, true);
    else if (e.dy === 1) paintCopingStrip(g, x, y + TW - cap, TW, cap, true);
    else paintCopingStrip(g, x, y, TW, cap, true);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + TW);
    maxY = Math.max(maxY, y + TW);
  }
  bakeStaticGraphics(scene, g, 'bake-haven-dock-coping', bakeRectFromBox(minX, minY, maxX - minX, maxY - minY));
}

/** Opaque sett paving over harbor stone + timber/rope coping on the drop-off. */
export function paintHavenDockSurfaces(scene: Phaser.Scene): void {
  paintSettField(scene);
  paintHavenDockCoping(scene);
  bindHavenDockNightWash(scene);
}

function bindHavenDockNightWash(scene: Phaser.Scene): void {
  const wash = scene.add.graphics().setDepth(2.55).setBlendMode(Phaser.BlendModes.MULTIPLY);
  const draw = (): void => {
    wash.clear();
    const hour = getWorldGameHour();
    const night = hour != null && (hour >= 20 || hour < 6);
    wash.setVisible(night);
    if (!night) return;
    for (const r of HAVEN_HARBOR_STONE) {
      wash.fillStyle(0x7a8494, 0.28);
      wash.fillRect(r.tx * TW, r.ty * TW, r.w * TW, r.h * TW);
    }
  };
  draw();
  const unsub = subscribeHavenSchedule(draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    wash.destroy();
  });
}

export function isHavenDockSurfaceRect(r: HavenTileRect): boolean {
  return HAVEN_HARBOR_STONE.some((s) => s.tx === r.tx && s.ty === r.ty && s.w === r.w && s.h === r.h);
}
