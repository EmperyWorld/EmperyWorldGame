import { resolveDecorAnchor } from './decor-anchor.js';
import { bindDecorSchedule } from './decor-schedule.js';
/**
 * Crafts district life: forge sparks, glass glow, loom, carpenter, miller.
 */
import Phaser from 'phaser';
import { Depth, entityDepth } from '../game/constants/depth.js';
import { placeWorldProp } from './place-world-prop.js';
import { COMBAT_ATLAS_KEY, registerCombatSprites, registerCitizenSprite } from './sprite-factory.js';
import { setupSpriteDisplay } from './sprite-loader.js';
import { attachEntityShadow, syncEntityShadow } from './visual-polish.js';
import { getHavenSchedule } from '../world-clock.js';
import { loopDecorCounter } from './decor-fx.js';

function pickFrame(scene: Phaser.Scene, preferred: string[]): string | null {
  if (!scene.textures.exists(COMBAT_ATLAS_KEY)) return null;
  const atlas = scene.textures.get(COMBAT_ATLAS_KEY);
  for (const f of preferred) {
    if (atlas.has(f)) return f;
  }
  const names = atlas.getFrameNames();
  return names.find((n) => n.startsWith('npc-') && n.endsWith('-0')) ?? names[0] ?? null;
}

function makeWorker(
  scene: Phaser.Scene,
  x: number,
  y: number,
  preferred: string[],
  scale = 0.85,
  tint = 0xffffff,
): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
  const anchor=resolveDecorAnchor(scene,x,y);
  if(anchor){x=anchor.x;y=anchor.y;}
  const frame = pickFrame(scene, preferred);
  if (frame) {
    const individual=registerCitizenSprite(scene,`decor-haven-crafts-${Math.round(x)}-${Math.round(y)}-${preferred[0]}`,frame);
    const spr = scene.add.sprite(x, y, individual.texture, individual.frame).setDepth(entityDepth(y));
    spr.setData('citizenIdentity',individual.prefix);
    setupSpriteDisplay(spr, scale);
    void tint;
    attachEntityShadow(scene, spr, 18, 7, 0.22);
    return spr;
  }
  return scene.add.rectangle(x, y, 22, 30, 0xc09070, 1).setDepth(entityDepth(y));
}

function dayOnly(
  scene: Phaser.Scene,
  start: () => void,
  stop: () => void,
): void {
  bindDecorSchedule(scene,start,stop,stop);
}

/** Blacksmith NPC landmark @ (800, 2080). */
function placeForgeLife(scene: Phaser.Scene, x: number, y: number): void {
  placeWorldProp(scene, 'prop_anvil', x + 36, y + 20, 68);
  placeWorldProp(scene, 'prop_coal_pile', x - 50, y + 24, 70);
  placeWorldProp(scene, 'prop_firewood', x - 70, y + 8, 62);

  const smith = makeWorker(scene, x + 20, y + 28, ['npc-town_blacksmith-0'], 0.9, 0xe8d0b0);
  const glow = scene.add.graphics().setDepth(Depth.Ambient);
  const sparks = scene.add.graphics().setDepth(Depth.Ambient);

  let hammer: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    hammer?.remove();
    smith.setVisible(false);
    glow.clear();
    sparks.clear();
  };
  const start = () => {
    smith.setVisible(true);
    hammer = scene.tweens.add({
      targets: smith,
      angle: { from: -4, to: 4 },
      duration: 280,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        smith.setDepth(entityDepth(smith.y));
        if (smith instanceof Phaser.GameObjects.Sprite) syncEntityShadow(smith);
      },
    });
  };

  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 900,
    repeat: -1,
    onUpdate: (tw) => {
      const sched = getHavenSchedule();
      const day = !(sched?.restActive ?? false);
      const p = tw.getValue() ?? 0;
      glow.clear();
      sparks.clear();
      if (!day) return;
      const flick = 0.55 + 0.45 * Math.sin(p * 6);
      glow.fillStyle(0xff6622, 0.22 * flick);
      glow.fillCircle(x + 36, y + 12, 22 + flick * 6);
      glow.fillStyle(0xffcc44, 0.18 * flick);
      glow.fillCircle(x + 36, y + 10, 10);
      for (let i = 0; i < 5; i++) {
        const t = (p * 2 + i * 1.1) % (Math.PI * 2);
        const rise = ((t / (Math.PI * 2)) * 28) % 28;
        sparks.fillStyle(0xffee88, 0.5 * (1 - rise / 28));
        sparks.fillCircle(x + 30 + Math.sin(t * 3 + i) * 10, y + 8 - rise, 2);
      }
    },
  });

  scene.add
    .text(x, y + 70, 'кузница', {
      color: '#e8c090',
      fontSize: '11px',
      fontStyle: 'bold',
      backgroundColor: '#00000077',
      padding: { x: 5, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  dayOnly(scene, start, stop);
}

/** Glassblower @ tile (6,34). */
function placeGlassLife(scene: Phaser.Scene, x: number, y: number): void {
  const worker = makeWorker(scene, x + 24, y + 40, ['npc-town_brewer-0'], 0.82, 0xd8e8f8);
  const fx = scene.add.graphics().setDepth(Depth.Ambient);
  let bob: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    bob?.remove();
    worker.setVisible(false);
    fx.clear();
  };
  const start = () => {
    worker.setVisible(true);
    bob = scene.tweens.add({
      targets: worker,
      angle: { from: -4, to: 4 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        worker.setDepth(entityDepth(worker.y));
        if (worker instanceof Phaser.GameObjects.Sprite) syncEntityShadow(worker);
      },
    });
  };
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 1600,
    repeat: -1,
    onUpdate: (tw) => {
      const day = !(getHavenSchedule()?.restActive ?? false);
      fx.clear();
      if (!day) return;
      const p = tw.getValue() ?? 0;
      const pulse = 0.5 + 0.5 * Math.sin(p * 3);
      fx.fillStyle(0x88ddff, 0.2 * pulse);
      fx.fillCircle(x + 10, y + 8, 18 + pulse * 6);
      fx.fillStyle(0xff8866, 0.15 * pulse);
      fx.fillCircle(x - 8, y + 16, 12);
    },
  });
  dayOnly(scene, start, stop);
}

/** Carpenter @ (8,30). */
function placeCarpenterLife(scene: Phaser.Scene, x: number, y: number): void {
  placeWorldProp(scene, 'prop_workbench', x + 30, y + 48, 80);
  placeWorldProp(scene, 'prop_plank_stack', x - 40, y + 40, 78);
  const worker = makeWorker(scene, x + 28, y + 52, ['npc-town_stable-0'], 0.84, 0xe8d8c0);
  let saw: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    saw?.remove();
    worker.setVisible(false);
  };
  const start = () => {
    worker.setVisible(true);
    saw = scene.tweens.add({
      targets: worker,
      angle: { from: -4, to: 4 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        worker.setDepth(entityDepth(worker.y));
        if (worker instanceof Phaser.GameObjects.Sprite) {
          worker.setFlipX(worker.x > x + 34);
          syncEntityShadow(worker);
        }
      },
    });
  };
  // Sawdust puffs
  const dust = scene.add.graphics().setDepth(3);
  loopDecorCounter(scene, {
    from: 0,
    to: 1,
    duration: 1200,
    repeat: -1,
    onUpdate: (tw) => {
      const day = !(getHavenSchedule()?.restActive ?? false);
      dust.clear();
      if (!day) return;
      const t = tw.getValue() ?? 0;
      for (let i = 0; i < 4; i++) {
        const u = (t + i * 0.25) % 1;
        dust.fillStyle(0xd4c090, 0.25 * (1 - u));
        dust.fillCircle(x + 34 + i * 3, y + 40 - u * 16, 2.5);
      }
    },
  });
  dayOnly(scene, start, stop);
}

/** Weaver @ (18,30). */
function placeWeaverLife(scene: Phaser.Scene, x: number, y: number): void {
  const worker = makeWorker(scene, x + 20, y + 44, ['npc-town_teacher-0'], 0.8, 0xf0e0f0);
  const threads = scene.add.graphics().setDepth(Depth.Ambient);
  let bob: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    bob?.remove();
    worker.setVisible(false);
    threads.clear();
  };
  const start = () => {
    worker.setVisible(true);
    bob = scene.tweens.add({
      targets: worker,
      angle: { from: -4, to: 4 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        worker.setDepth(entityDepth(worker.y));
        if (worker instanceof Phaser.GameObjects.Sprite) syncEntityShadow(worker);
      },
    });
  };
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2000,
    repeat: -1,
    onUpdate: (tw) => {
      const day = !(getHavenSchedule()?.restActive ?? false);
      threads.clear();
      if (!day) return;
      const p = tw.getValue() ?? 0;
      for (let i = 0; i < 4; i++) {
        const sway = Math.sin(p + i) * 4;
        threads.lineStyle(2, [0xc04060, 0x4060c0, 0xd4a040, 0x40a060][i]!, 0.55);
        threads.lineBetween(x - 10 + i * 8, y + 10, x - 6 + i * 8 + sway, y + 36);
      }
    },
  });
  dayOnly(scene, start, stop);
}

/** Miller near windmill landmark (1440, 2208) / millstone. */
function placeMillerLife(scene: Phaser.Scene, x: number, y: number): void {
  placeWorldProp(scene, 'prop_flour_sacks', x - 30, y + 30, 70);
  const miller = makeWorker(scene, x + 10, y + 36, ['npc-town_merchant-0'], 0.86, 0xf0e8d0);
  let haul: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    haul?.remove();
    miller.setVisible(false);
  };
  const start = () => {
    miller.setVisible(true);
    haul = scene.tweens.add({
      targets: miller,
      angle: { from: -4, to: 4 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        miller.setDepth(entityDepth(miller.y));
        if (miller instanceof Phaser.GameObjects.Sprite) {
          miller.setFlipX(miller.x > x + 20);
          syncEntityShadow(miller);
        }
      },
    });
  };
  // Flour dust
  const dust = scene.add.graphics().setDepth(3);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2800,
    repeat: -1,
    onUpdate: (tw) => {
      const day = !(getHavenSchedule()?.restActive ?? false);
      dust.clear();
      if (!day) return;
      const p = tw.getValue() ?? 0;
      for (let i = 0; i < 6; i++) {
        const a = p + i;
        dust.fillStyle(0xf0e8d0, 0.12);
        dust.fillCircle(x + Math.cos(a) * 20, y + 10 + Math.sin(a * 1.3) * 12, 3);
      }
    },
  });
  dayOnly(scene, start, stop);
}

/** Potter at kiln @ (16,28). */
function placePotterLife(scene: Phaser.Scene, x: number, y: number): void {
  const potter = makeWorker(scene, x + 18, y + 40, ['npc-town_healer-0'], 0.8, 0xd8c0a0);
  const heat = scene.add.graphics().setDepth(Depth.Ambient);
  let bob: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    bob?.remove();
    potter.setVisible(false);
    heat.clear();
  };
  const start = () => {
    potter.setVisible(true);
    bob = scene.tweens.add({
      targets: potter,
      angle: { from: -4, to: 4 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        potter.setDepth(entityDepth(potter.y));
        if (potter instanceof Phaser.GameObjects.Sprite) syncEntityShadow(potter);
      },
    });
  };
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 1100,
    repeat: -1,
    onUpdate: (tw) => {
      const day = !(getHavenSchedule()?.restActive ?? false);
      heat.clear();
      if (!day) return;
      const p = tw.getValue() ?? 0;
      const flick = 0.5 + 0.5 * Math.sin(p * 4);
      heat.fillStyle(0xff6622, 0.16 * flick);
      heat.fillCircle(x, y + 4, 16 + flick * 5);
      heat.fillStyle(0xffaa44, 0.12 * flick);
      heat.fillCircle(x, y, 8);
    },
  });
  dayOnly(scene, start, stop);
}

/**
 * Crafts quarter ambient life — forge, glass, wood, loom, mill, pottery.
 */
export function placeHavenCrafts(scene: Phaser.Scene): void {
  try {
    registerCombatSprites(scene, 'human');
  } catch {
    /* atlas may already exist */
  }

  const tw = 64;
  const px = (tx: number, ty: number) => [tx * tw + 32, ty * tw + 32] as const;

  // Packed earth + soot under the crafts pocket
  const ground = scene.add.graphics().setDepth(2);
  const [cx, cy] = px(12, 32);
  ground.fillStyle(0x5a4838, 0.14);
  ground.fillEllipse(cx, cy, 520, 380);
  ground.fillStyle(0x3a3028, 0.08);
  ground.fillEllipse(cx - 40, cy + 40, 280, 200);
  ground.fillStyle(0xb89860, 0.06);
  ground.fillEllipse(px(20, 34)[0], px(20, 34)[1], 220, 160);

  // Cobble spine through crafts
  const paths = scene.add.graphics().setDepth(2);
  const segs: Array<readonly [number, number, number, number]> = [
    [6 * tw + 32, 32 * tw + 32, 20 * tw + 32, 32 * tw + 32],
    [8 * tw + 32, 28 * tw + 32, 8 * tw + 32, 36 * tw + 32],
    [14 * tw + 32, 28 * tw + 32, 14 * tw + 32, 36 * tw + 32],
    [12 * tw + 32, 30 * tw + 32, 12 * tw + 32, 36 * tw + 32],
    [16 * tw + 32, 32 * tw + 32, 16 * tw + 32, 36 * tw + 32],
  ];
  for (const [x1, y1, x2, y2] of segs) {
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const pxth = x1 + (x2 - x1) * t;
      const pyth = y1 + (y2 - y1) * t;
      paths.fillStyle(0x4a4030, 0.22);
      paths.fillEllipse(pxth, pyth, 44, 24);
      paths.fillStyle(0x6a6050, 0.12);
      paths.fillEllipse(pxth, pyth, 28, 14);
    }
  }

  // Blacksmith landmark world coords
  placeForgeLife(scene, 800, 2080);
  placeGlassLife(scene, ...px(6, 34));
  placeCarpenterLife(scene, ...px(8, 30));
  placeWeaverLife(scene, ...px(18, 30));
  placeMillerLife(scene, ...px(20, 34));
  placePotterLife(scene, ...px(16, 28));

  scene.add
    .text(cx, cy - 120, 'квартал ремёсел', {
      color: '#e07840',
      fontSize: '12px',
      fontStyle: 'bold',
      backgroundColor: '#00000077',
      padding: { x: 6, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);
}
