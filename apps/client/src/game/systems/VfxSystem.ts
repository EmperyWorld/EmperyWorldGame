import Phaser from 'phaser';
import { Depth } from '../constants/depth.js';
import { atmosphereFor } from '../../sprites/vfx.js';
import { getGraphicsProfile } from './graphics-quality.js';
import { spawnGpuAmbientMotes } from '../../sprites/gpu-decor.js';

const SPARK_POOL = 12;
const FLOAT_TEXT_POOL = 24;
const SLASH_POOL = 3;
const ARROW_POOL = 4;
const BURST_POOL = 3;
const AMBIENT_POOL_CAP = 12;
const AMBIENT_TICK_MS = 600;

interface ArrowSlot {
  line: Phaser.GameObjects.Line;
  tip: Phaser.GameObjects.Arc;
}

export class VfxSystem {
  private scene!: Phaser.Scene;
  private sparkPool: Phaser.GameObjects.Arc[] = [];
  private sparkIndex = 0;
  private floatTextPool: Phaser.GameObjects.Text[] = [];
  private floatTextIndex = 0;
  private slashPool: Phaser.GameObjects.Ellipse[] = [];
  private slashIndex = 0;
  private slashRingPool: Phaser.GameObjects.Arc[] = [];
  private slashRingIndex = 0;
  private arrowPool: ArrowSlot[] = [];
  private arrowIndex = 0;
  private burstPool: Phaser.GameObjects.Arc[] = [];
  private burstIndex = 0;
  private ambient: Phaser.GameObjects.Arc[] = [];
  private ambientGpu: Phaser.GameObjects.SpriteGPULayer | null = null;
  private ambientEvent?: Phaser.Time.TimerEvent;

  init(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparkPool = [];
    this.sparkIndex = 0;
    for (let i = 0; i < SPARK_POOL; i++) {
      const s = scene.add.circle(0, 0, 2, 0xffffff, 0).setDepth(Depth.VfxSpark).setVisible(false);
      this.sparkPool.push(s);
    }

    this.floatTextPool = [];
    this.floatTextIndex = 0;
    for (let i = 0; i < FLOAT_TEXT_POOL; i++) {
      const t = scene.add
        .text(0, 0, '', {
          color: '#ffffff',
          fontSize: '16px',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(Depth.FloatText)
        .setVisible(false);
      this.floatTextPool.push(t);
    }

    this.slashPool = [];
    this.slashIndex = 0;
    for (let i = 0; i < SLASH_POOL; i++) {
      const slash = scene.add.ellipse(0, 0, 52, 28, 0xffcc66, 0.4).setDepth(Depth.CombatFx).setVisible(false);
      this.slashPool.push(slash);
    }
    this.slashRingPool = [];
    this.slashRingIndex = 0;
    for (let i = 0; i < SLASH_POOL; i++) {
      const ring = scene.add.circle(0, 0, 10, 0x88ccff, 0.35).setDepth(Depth.EntityMark).setVisible(false);
      this.slashRingPool.push(ring);
    }

    this.arrowPool = [];
    this.arrowIndex = 0;
    for (let i = 0; i < ARROW_POOL; i++) {
      const line = scene.add.line(0, 0, 0, 0, 0, 0, 0xe8d090, 1).setOrigin(0, 0).setDepth(Depth.ArrowLine).setVisible(false);
      line.setLineWidth(2);
      const tip = scene.add.circle(0, 0, 3, 0xfff0c0, 0.9).setDepth(Depth.VfxSpark).setVisible(false);
      this.arrowPool.push({ line, tip });
    }

    this.burstPool = [];
    this.burstIndex = 0;
    for (let i = 0; i < BURST_POOL; i++) {
      const b = scene.add.circle(0, 0, 10, 0xffaa44, 0).setDepth(Depth.CombatFx).setVisible(false);
      this.burstPool.push(b);
    }
  }

  shutdown(): void {
    try {
      this.ambientEvent?.remove(false);
    } catch {
      /* scene may already be torn down */
    }
    this.ambientEvent = undefined;

    const kill = (obj: Phaser.GameObjects.GameObject | undefined): void => {
      if (!obj) return;
      try {
        this.scene?.tweens.killTweensOf(obj);
      } catch {
        /* ignore */
      }
      try {
        if (obj.active) obj.destroy();
      } catch {
        /* ignore */
      }
    };

    for (const a of this.ambient) kill(a);
    this.ambient = [];
    try {
      this.ambientGpu?.destroy();
    } catch {
      /* ignore */
    }
    this.ambientGpu = null;
    for (const s of this.sparkPool) kill(s);
    this.sparkPool = [];
    for (const t of this.floatTextPool) kill(t);
    this.floatTextPool = [];
    for (const slash of this.slashPool) kill(slash);
    this.slashPool = [];
    for (const ring of this.slashRingPool) kill(ring);
    this.slashRingPool = [];
    for (const slot of this.arrowPool) {
      kill(slot.line);
      kill(slot.tip);
    }
    this.arrowPool = [];
    for (const b of this.burstPool) kill(b);
    this.burstPool = [];
  }

  /** Раньше: fog + vignette — только затемняли карту. Оставляем чистый вид. */
  addAtmosphere(_locationId: string): void {
    /* no-op */
  }

  spawnAmbient(locationId: string, mapW: number, mapH: number): void {
    this.ambientEvent?.remove(false);
    for (const a of this.ambient) a.destroy();
    this.ambient = [];
    this.ambientGpu?.destroy();
    this.ambientGpu = null;

    const atm = atmosphereFor(locationId);
    const profile = getGraphicsProfile();
    if (!profile.ambientParticles || profile.ambientParticleScale <= 0) return;
    const scaled = Math.max(0, Math.round(atm.particleCount * profile.ambientParticleScale));
    if (scaled <= 0) return;

    const gpu = spawnGpuAmbientMotes(
      this.scene,
      scaled,
      mapW,
      mapH,
      atm.particleColor,
      atm.particleAlpha,
      Depth.Ambient,
    );
    if (gpu) {
      this.ambientGpu = gpu;
      return;
    }

    const count = Math.min(scaled, AMBIENT_POOL_CAP);
    for (let i = 0; i < count; i++) {
      const size = Phaser.Math.FloatBetween(1.5, 3.5);
      const p = this.scene.add
        .circle(0, 0, size, atm.particleColor, 0)
        .setDepth(Depth.Ambient)
        .setVisible(false);
      this.ambient.push(p);
    }

    this.ambientEvent = this.scene.time.addEvent({
      delay: AMBIENT_TICK_MS,
      loop: true,
      callback: () => this.recycleAmbient(atm.particleAlpha, mapW, mapH),
    });
  }

  private recycleAmbient(alpha: number, mapW: number, mapH: number): void {
    const p = this.ambient[Phaser.Math.Between(0, this.ambient.length - 1)];
    if (!p || !p.scene) return;
    if (this.scene.tweens.isTweening(p)) return;
    const nx = Phaser.Math.Between(40, mapW - 40);
    const ny = Phaser.Math.Between(40, mapH - 40);
    p.setPosition(nx, ny).setVisible(true).setAlpha(alpha).setScale(1);
    this.scene.tweens.add({
      targets: p,
      x: nx + Phaser.Math.Between(-50, 50),
      y: ny + Phaser.Math.Between(-70, -15),
      alpha: 0,
      duration: Phaser.Math.Between(2600, 5000),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (p.active) p.setVisible(false);
      },
    });
  }

  sparks(x: number, y: number, color = 0xffcc66, count = 6): void {
    const n = Math.min(count, SPARK_POOL);
    for (let i = 0; i < n; i++) {
      const spark = this.sparkPool[this.sparkIndex % SPARK_POOL]!;
      this.sparkIndex++;
      if (!spark.active) continue;
      this.scene.tweens.killTweensOf(spark);
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const dist = 18 + Math.random() * 22;
      spark
        .setPosition(x, y)
        .setFillStyle(color, 0.95)
        .setScale(1)
        .setVisible(true)
        .setAlpha(0.95);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 220 + Math.random() * 120,
        onComplete: () => {
          if (spark.active) spark.setVisible(false);
        },
      });
    }
  }

  slash(x: number, y: number, facingRight: boolean, skill = false): void {
    const color = skill ? 0x88ccff : 0xffcc66;
    const slash = this.slashPool[this.slashIndex % SLASH_POOL]!;
    this.slashIndex++;
    if (!slash.active) return;

    this.scene.tweens.killTweensOf(slash);
    slash
      .setPosition(x + (facingRight ? 22 : -22), y)
      .setFillStyle(color, skill ? 0.55 : 0.4)
      .setScale(facingRight ? 1 : -1, 1)
      .setAlpha(skill ? 0.55 : 0.4)
      .setVisible(true);

    this.scene.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: (facingRight ? 1 : -1) * 1.55,
      scaleY: 1.45,
      duration: skill ? 280 : 200,
      onComplete: () => {
        if (slash.active) slash.setVisible(false);
      },
    });

    if (!skill) return;

    const ring = this.slashRingPool[this.slashRingIndex % SLASH_POOL]!;
    this.slashRingIndex++;
    if (!ring.active) return;

    this.scene.tweens.killTweensOf(ring);
    ring.setPosition(x, y).setFillStyle(color, 0.35).setScale(1).setAlpha(0.35).setVisible(true);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 3.2,
      duration: 320,
      onComplete: () => {
        if (ring.active) ring.setVisible(false);
      },
    });
  }

  deathBurst(x: number, y: number, color = 0xffaa44): void {
    if (!this.scene.sys.isActive()) return;
    const burst = this.burstPool[this.burstIndex % BURST_POOL]!;
    this.burstIndex++;
    if (burst.active) {
      this.scene.tweens.killTweensOf(burst);
      burst
        .setPosition(x, y)
        .setFillStyle(color, 0.85)
        .setScale(1)
        .setAlpha(0.85)
        .setVisible(true);
      this.scene.tweens.add({
        targets: burst,
        alpha: 0,
        scale: 3.5,
        duration: 320,
        onComplete: () => {
          if (burst.active) burst.setVisible(false);
        },
      });
    }
    this.sparks(x, y, color, 8);
    for (let i = 0; i < 4; i++) {
      const spark = this.sparkPool[this.sparkIndex % SPARK_POOL]!;
      this.sparkIndex++;
      if (!spark.active) continue;
      this.scene.tweens.killTweensOf(spark);
      spark
        .setPosition(x, y)
        .setFillStyle(0xffffff, 0.7)
        .setScale(1.4)
        .setVisible(true)
        .setAlpha(0.7);
      this.scene.tweens.add({
        targets: spark,
        y: y - 30 - Math.random() * 20,
        x: x + Phaser.Math.Between(-24, 24),
        alpha: 0,
        scale: 0.4,
        duration: 400 + Math.random() * 200,
        onComplete: () => {
          if (spark.active) spark.setVisible(false);
        },
      });
    }
  }

  /** NPC ▼ marker — caller updates world position while visible (patrol follow). */
  createNpcMarker(x: number, y: number, color: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y - 52, '▼', { color, fontSize: '14px', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(Depth.EntityMark);
  }

  floatText(x: number, y: number, text: string, color: string): void {
    const label = this.floatTextPool[this.floatTextIndex % FLOAT_TEXT_POOL]!;
    this.floatTextIndex++;
    if (!label.active) return;

    this.scene.tweens.killTweensOf(label);
    label
      .setText(text)
      .setColor(color)
      .setFontSize(text.includes('CRIT') ? '20px' : '16px')
      .setPosition(x, y - 24)
      .setAlpha(1)
      .setScale(1)
      .setVisible(true);

    this.scene.tweens.add({
      targets: label,
      y: y - 56,
      alpha: 0,
      scale: 1.15,
      duration: 780,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (label.active) label.setVisible(false);
      },
    });
  }

  /** Hitscan-стрела: короткая линия от лучника к цели. */
  arrowShot(fromX: number, fromY: number, toX: number, toY: number): void {
    const slot = this.arrowPool[this.arrowIndex % ARROW_POOL]!;
    this.arrowIndex++;
    const { line, tip } = slot;
    if (!line.active || !tip.active) return;

    this.scene.tweens.killTweensOf([line, tip]);
    line.setStrokeStyle(2, 0xe8d4a0, 0.9);
    tip.setFillStyle(0xc9a66b, 1);
    line.setTo(fromX, fromY - 6, toX, toY - 8).setAlpha(1).setVisible(true);
    tip.setPosition(toX, toY - 8).setAlpha(0.9).setVisible(true);

    this.scene.tweens.add({
      targets: [line, tip],
      alpha: 0,
      duration: 180,
      onComplete: () => {
        if (line.active) line.setVisible(false);
        if (tip.active) tip.setVisible(false);
      },
    });
  }

  /** Магический болт мистика. */
  magicBolt(fromX: number, fromY: number, toX: number, toY: number): void {
    const slot = this.arrowPool[this.arrowIndex % ARROW_POOL]!;
    this.arrowIndex++;
    const { line, tip } = slot;
    if (!line.active || !tip.active) return;

    this.scene.tweens.killTweensOf([line, tip]);
    line.setStrokeStyle(2.5, 0x88ccff, 0.95);
    tip.setFillStyle(0xaaccff, 1);
    line.setTo(fromX, fromY - 4, toX, toY - 6).setAlpha(1).setVisible(true);
    tip.setPosition(toX, toY - 6).setAlpha(1).setVisible(true);

    this.scene.tweens.add({
      targets: [line, tip],
      alpha: 0,
      duration: 220,
      onComplete: () => {
        if (line.active) {
          line.setStrokeStyle(2, 0xe8d4a0, 0.9);
          line.setVisible(false);
        }
        if (tip.active) {
          tip.setFillStyle(0xc9a66b, 1);
          tip.setVisible(false);
        }
      },
    });
  }
}
