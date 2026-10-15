/**
 * Harbor life on the stone: mooring posts, hawsers, fishers, drunks, a brawl, perched gulls.
 * People use the combat atlas at citizen scale — not 7px rectangles.
 */
import Phaser from 'phaser';
import {
  HAVEN_HARBOR_BRAWL_BARK,
  HAVEN_HARBOR_BRAWL_HIT_SFX,
  HAVEN_HARBOR_BRAWL_ROUND_MS,
  HAVEN_HARBOR_BRAWL_TILE,
  havenHarborBrawlHitEdge,
  havenHarborBrawlNextBark,
  havenHarborBrawlPose,
  havenHarborCopingEdges,
  havenWorldFromTile,
  isHavenOpenWaterTile,
} from '@empery/shared';
import { playHarborBrawlHit } from '../harbor-brawl-audio.js';
import { Depth, entityDepth } from '../game/constants/depth.js';
import { loopDecorCounter } from './decor-fx.js';
import { PLAYER_XY_KEY } from './haven-citizens.js';
import { COMBAT_ATLAS_KEY, playerSpriteFrame, registerCitizenSprite } from './sprite-factory.js';
import { setupSpriteDisplay } from './sprite-loader.js';
import { attachEntityShadow } from './visual-polish.js';

const TW = 64;

function pickFrame(scene: Phaser.Scene, preferred: string[]): string | null {
  if (!scene.textures.exists(COMBAT_ATLAS_KEY)) return null;
  const atlas = scene.textures.get(COMBAT_ATLAS_KEY);
  for (const f of preferred) {
    if (atlas.has(f)) return f;
  }
  return null;
}

function sailor(
  scene: Phaser.Scene,
  x: number,
  y: number,
  frames: string[],
  scale: number,
  tint = 0xffffff,
): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
  const frame = pickFrame(scene, frames);
  if (frame) {
    const individual=registerCitizenSprite(scene,`decor-haven-harbor-life-${Math.round(x)}-${Math.round(y)}-${frames[0]}`,frame);
    const spr = scene.add.sprite(x, y, individual.texture, individual.frame).setDepth(entityDepth(y));
    spr.setData('citizenIdentity',individual.prefix);
    setupSpriteDisplay(spr, scale);
    void tint;
    attachEntityShadow(scene, spr, 18, 7, 0.22);
    return spr;
  }
  return scene.add
    .rectangle(x, y - 10, 22, 36, 0xc8b090, 1)
    .setDepth(entityDepth(y))
    .setStrokeStyle(2, tint === 0xffffff ? 0x5a4030 : tint, 0.8);
}

function paintMooringAndCoils(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(2.4);
  let i = 0;
  for (const e of havenHarborCopingEdges()) {
    if (!isHavenOpenWaterTile(e.tx + e.dx, e.ty + e.dy)) continue;
    i += 1;
    if (i % 3 !== 0) continue;
    const cx = e.tx * TW + 32 - e.dx * 18;
    const cy = e.ty * TW + 32 - e.dy * 18;
    g.fillStyle(0x3a3a40, 1);
    g.fillRect(cx - 4, cy - 10, 8, 16);
    g.fillStyle(0x6a6a70, 1);
    g.fillCircle(cx, cy - 11, 5);
    g.lineStyle(2, 0x8a8a90, 1);
    g.strokeCircle(cx, cy - 11, 6);
    if (i % 6 === 0) {
      g.lineStyle(2.5, 0xb08950, 0.95);
      g.beginPath();
      g.arc(cx + e.dx * 12, cy + e.dy * 12, 9, 0, Math.PI * 1.7);
      g.strokePath();
      g.beginPath();
      g.arc(cx + e.dx * 12, cy + e.dy * 12, 5, 0.4, Math.PI * 1.9);
      g.strokePath();
    }
  }
}

function bindFishers(scene: Phaser.Scene): void {
  const spots: Array<{ tile: readonly [number, number]; water: readonly [number, number] }> = [
    { tile: [68, 69], water: [68, 71] },
    { tile: [70, 69], water: [70, 71] },
    { tile: [74, 64], water: [76, 64] },
    { tile: [73, 58], water: [76, 58] },
  ];
  const human = playerSpriteFrame('human', 0, 'male');
  const lines = scene.add.graphics().setDepth(Depth.Decor);
  const draw = (phase: number): void => {
    lines.clear();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      const from = havenWorldFromTile(s.tile[0], s.tile[1]);
      const to = havenWorldFromTile(s.water[0], s.water[1]);
      const bob = Math.sin(phase * 2 + i) * 5;
      lines.lineStyle(1.6, 0xd8c8a0, 0.9);
      lines.beginPath();
      lines.moveTo(from.x + 10, from.y - 22);
      lines.lineTo(to.x, to.y + bob);
      lines.strokePath();
      lines.fillStyle(0xc8b070, 0.8);
      lines.fillCircle(to.x, to.y + bob, 3);
    }
  };
  for (const s of spots) {
    const p = havenWorldFromTile(s.tile[0], s.tile[1]);
    sailor(scene, p.x, p.y, [human], 0.95, 0xc8d0d8);
  }
  draw(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2400,
    repeat: -1,
    onUpdate: (tw) => draw(tw.getValue() ?? 0),
  });
}

function bindDrunks(scene: Phaser.Scene): void {
  const orc = playerSpriteFrame('orc', 0, 'male');
  const human = playerSpriteFrame('human', 0, 'male');
  const drunks = [
    { x: 56 * TW + 20, y: 53 * TW + 10, frames: [orc], tint: 0xffc080 },
    { x: 59 * TW + 8, y: 52 * TW + 40, frames: [human], tint: 0xffd0a0 },
    { x: 72 * TW, y: 53 * TW + 20, frames: [human], tint: 0xe8c090 },
  ];
  for (let i = 0; i < drunks.length; i++) {
    const d = drunks[i]!;
    const spr = sailor(scene, d.x, d.y, d.frames, 1, d.tint);
    spr.setAngle(-6);
    scene.tweens.add({
      targets: spr,
      x: d.x + 36 + i * 8,
      angle: { from: -12, to: 14 },
      duration: 2400 + i * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

function bindBrawl(scene: Phaser.Scene): void {
  const a = havenWorldFromTile(HAVEN_HARBOR_BRAWL_TILE[0], HAVEN_HARBOR_BRAWL_TILE[1]);
  const orc = playerSpriteFrame('orc', 0, 'male');
  const human = playerSpriteFrame('human', 0, 'male');
  const left = sailor(scene, a.x - 32, a.y, [orc], 1.12, 0xffc8a0);
  const right = sailor(scene, a.x + 32, a.y, [human], 1.12, 0xc8d8e8);
  if ('setFlipX' in left) left.setFlipX(false);
  if ('setFlipX' in right) right.setFlipX(true);
  const fx = scene.add.graphics().setDepth(Depth.CombatFx);
  let bark = HAVEN_HARBOR_BRAWL_BARK;
  const label = scene.add
    .text(a.x, a.y - 66, bark, {
      fontFamily: 'serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#fff6d0',
      backgroundColor: '#140a06f2',
      stroke: '#100804',
      strokeThickness: 4,
      padding: { x: 8, y: 4 },
    })
    .setOrigin(0.5)
    .setDepth(Depth.FloatText)
    .setAlpha(0.7);
  let prevImpact = 0;
  const apply = (ms: number): void => {
    const pose = havenHarborBrawlPose(ms);
    left.x = a.x + pose.leftX;
    right.x = a.x + pose.rightX;
    left.y = a.y + pose.leftY;
    right.y = a.y + pose.rightY;
    if ('setAngle' in left) left.setAngle(pose.leftAngle);
    if ('setAngle' in right) right.setAngle(pose.rightAngle);
    left.setDepth(entityDepth(left.y));
    right.setDepth(entityDepth(right.y));
    if (havenHarborBrawlHitEdge(prevImpact, pose.impact)) {
      bark = havenHarborBrawlNextBark(bark, Math.random);
      label.setText(bark);
      const getPlayer = scene.data.get(PLAYER_XY_KEY) as
        | (() => { x: number; y: number } | null)
        | undefined;
      const player = getPlayer?.() ?? null;
      playHarborBrawlHit(
        player
          ? {
              sourceX: a.x,
              sourceY: a.y,
              listenerX: player.x,
              listenerY: player.y,
              innerRadius: 180,
              outerRadius: 640,
            }
          : undefined,
      );
      const harbor = window as Window & { __EMPERY_HARBOR__?: Record<string, unknown> };
      if (harbor.__EMPERY_HARBOR__) {
        harbor.__EMPERY_HARBOR__.hitSfx = HAVEN_HARBOR_BRAWL_HIT_SFX;
        harbor.__EMPERY_HARBOR__.lastBrawlBark = bark;
      }
    }
    prevImpact = pose.impact;
    fx.clear();
    if (pose.impact > 0.04) {
      const mx = (left.x + right.x) * 0.5;
      const my = (left.y + right.y) * 0.5 - 10;
      fx.fillStyle(0xfff3c0, pose.impact * 0.95);
      fx.fillCircle(mx, my, 6 + pose.impact * 14);
      fx.lineStyle(2.4, 0xffe080, pose.impact);
      fx.strokeCircle(mx, my, 12 + pose.impact * 16);
      fx.fillStyle(0xc4a878, pose.impact * 0.5);
      fx.fillCircle(mx - 14, my + 18, 4);
      fx.fillCircle(mx + 13, my + 20, 3.2);
    }
    label.setAlpha(pose.bark ? 1 : 0.5 + pose.impact * 0.45);
    label.y = a.y - 66 - pose.impact * 12;
    label.setScale(1 + pose.impact * 0.14);
  };
  apply(0);
  loopDecorCounter(scene, {
    from: 0,
    to: HAVEN_HARBOR_BRAWL_ROUND_MS,
    duration: HAVEN_HARBOR_BRAWL_ROUND_MS,
    repeat: -1,
    onUpdate: (tw) => apply(tw.getValue() ?? 0),
  });
}

function bindPerchedGulls(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(Depth.Decor + 0.2);
  const posts: Array<{ x: number; y: number }> = [];
  let n = 0;
  for (const e of havenHarborCopingEdges()) {
    if (!isHavenOpenWaterTile(e.tx + e.dx, e.ty + e.dy)) continue;
    n += 1;
    if (n % 5 !== 0) continue;
    posts.push({
      x: e.tx * TW + 32 - e.dx * 18,
      y: e.ty * TW + 32 - e.dy * 18 - 14,
    });
  }
  const draw = (phase: number): void => {
    g.clear();
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]!;
      const hop = Math.max(0, Math.sin(phase * 2 + i * 1.7)) * 6;
      g.fillStyle(0xf7fafc, 1);
      g.fillEllipse(p.x, p.y - hop, 8, 5);
      g.fillCircle(p.x + 4, p.y - hop - 2, 2.4);
      g.fillStyle(0xf0a020, 1);
      g.fillTriangle(p.x + 6, p.y - hop - 2, p.x + 10, p.y - hop - 1, p.x + 6, p.y - hop);
    }
  };
  draw(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 3200,
    repeat: -1,
    onUpdate: (tw) => draw(tw.getValue() ?? 0),
  });
}

export function bindHavenHarborLife(scene: Phaser.Scene): void {
  paintMooringAndCoils(scene);
  bindFishers(scene);
  bindDrunks(scene);
  bindBrawl(scene);
  bindPerchedGulls(scene);
}
