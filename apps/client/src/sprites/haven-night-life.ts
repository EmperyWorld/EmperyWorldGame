/**
 * Night-only pockets: forum market, tavern spill, cathedral candles, harbor lanterns.
 * Extra sprites sit behind `havenVignettes`; looping glow uses `loopDecorCounter`.
 */
import Phaser from 'phaser';
import { Depth, entityDepth } from '../game/constants/depth.js';
import { getGraphicsProfile } from '../game/systems/graphics-quality.js';
import { getHavenSchedule, getWorldGameHour, subscribeHavenSchedule } from '../world-clock.js';
import { loopDecorCounter, loopDecorTween } from './decor-fx.js';
import { COMBAT_ATLAS_KEY, registerCitizenSprite } from './sprite-factory.js';
import { setupSpriteDisplay } from './sprite-loader.js';
import { attachEntityShadow } from './visual-polish.js';
import { HAVEN_NIGHT_VENUES } from './haven-night-venues.js';
import { nudgePointFromPropColliders } from './prop-colliders.js';
import { havenNightlifeActive } from './haven-nightlife-state.js';

const TW = 64;
const tile = (tx: number, ty: number) => ({ x: tx * TW + TW / 2, y: ty * TW + TW / 2 });

function pickFrame(scene: Phaser.Scene, preferred: string[]): string | null {
  if (!scene.textures.exists(COMBAT_ATLAS_KEY)) return null;
  const atlas = scene.textures.get(COMBAT_ATLAS_KEY);
  for (const f of preferred) {
    if (atlas.has(f)) return f;
  }
  return null;
}

function makePerson(
  scene: Phaser.Scene,
  x: number,
  y: number,
  preferred: string[],
  scale: number,
  tint = 0xffffff,
): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
  const frame = pickFrame(scene, preferred);
  if (frame) {
    const individual=registerCitizenSprite(scene,`decor-haven-night-life-${Math.round(x)}-${Math.round(y)}-${preferred[0]}`,frame);
    const spr = scene.add.sprite(x, y, individual.texture, individual.frame).setDepth(entityDepth(y));
    spr.setData('citizenIdentity',individual.prefix);
    setupSpriteDisplay(spr, scale);
    void tint;
    attachEntityShadow(scene, spr, scale > 0.7 ? 16 : 12, 6, 0.2);
    return spr;
  }
  return scene.add.rectangle(x, y, 16, 24, 0xc8b090, 1).setDepth(entityDepth(y)).setStrokeStyle(1, tint, 0.5);
}

/** Night market on the forum, vigil, tavern court, harbor lights. */
export function placeHavenNightLife(scene: Phaser.Scene): void {
  const gfx = getGraphicsProfile();
  const nightObjs: Array<{ setVisible: (v: boolean) => unknown }> = [];
  const fx = scene.add.graphics().setDepth(Depth.Decor);
  nightObjs.push(fx);

  const market = tile(40, 21);
  const innDoor = HAVEN_NIGHT_VENUES.tavern;
  const cathedral = HAVEN_NIGHT_VENUES.cathedral;
  const harbor = tile(62, 53);
  const harborGuest = nudgePointFromPropColliders(scene, harbor.x + 48, harbor.y + 36, 14);
  const informant = HAVEN_NIGHT_VENUES.informant;

  const label = scene.add
    .text(market.x, market.y - 86, 'Ночной ряд', {
      color: '#f0d090',
      fontSize: '13px',
      fontStyle: 'bold',
      backgroundColor: '#120c08cc',
      padding: { x: 8, y: 3 },
    })
    .setOrigin(0.5, 1)
    .setDepth(Depth.FloatText)
    .setVisible(false);
  nightObjs.push(label);

  if (gfx.havenVignettes) {
    const girl = makePerson(
      scene,
      harborGuest.x,
      harborGuest.y,
      ['npc-town_healer-0', 'npc-elder_mira-0'],
      0.58,
      0xffe8d0,
    );
    girl.setVisible(false);
    nightObjs.push(girl);
    const shadow = girl.getData('dropShadow') as Phaser.GameObjects.Ellipse | undefined;
    if (shadow) { shadow.setVisible(false); nightObjs.push(shadow); }
    loopDecorTween(scene, {
      targets: girl,
      y: harborGuest.y - 4,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  let night = false;
  const drawNight = (phase: number) => {
    if (!night) return;
    fx.clear();

    // Forum stalls + lantern string (north of the fountain).
    const stalls = [
      { x: market.x - 170, y: market.y - 40, hue: 0xffb060 },
      { x: market.x + 160, y: market.y - 28, hue: 0xffc878 },
      { x: market.x + 10, y: market.y - 110, hue: 0xe8a050 },
    ];
    for (let i = 0; i < stalls.length; i++) {
      const s = stalls[i]!;
      const pulse = 0.94 + 0.06 * Math.sin(phase * 1.6 + i);
      fx.fillStyle(s.hue, 0.16 * pulse);
      fx.fillEllipse(s.x, s.y + 8, 88, 48);
      fx.fillStyle(0x5a4030, 0.55);
      fx.fillRect(s.x - 28, s.y - 6, 56, 14);
      fx.fillStyle(0x3a2818, 0.7);
      fx.fillRect(s.x - 22, s.y - 22, 6, 18);
      fx.fillRect(s.x + 16, s.y - 22, 6, 18);
      fx.fillStyle(0x8a5030, 0.55);
      fx.fillTriangle(s.x - 34, s.y - 18, s.x + 34, s.y - 18, s.x, s.y - 36);
      fx.fillStyle(0xffe0a0, 0.55 * pulse);
      fx.fillCircle(s.x, s.y - 28, 4);
    }
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const lx = market.x - 200 + t * 400;
      const ly = market.y - 72 + Math.sin(t * Math.PI) * -18;
      const pulse = 0.9 + 0.1 * Math.sin(phase * 2 + i * 0.7);
      fx.fillStyle(0xffc060, 0.22 * pulse);
      fx.fillCircle(lx, ly, 7);
      fx.fillStyle(0xfff0c0, 0.55 * pulse);
      fx.fillCircle(lx, ly, 2.4);
    }

    // Tavern court spill.
    const innPulse = 0.94 + 0.06 * Math.sin(phase * 1.3);
    fx.fillStyle(0xff9040, 0.14 * innPulse);
    fx.fillEllipse(innDoor.x, innDoor.y, 160, 90);
    fx.fillStyle(0xffc060, 0.2 * innPulse);
    fx.fillCircle(innDoor.x - 12, innDoor.y - 8, 16);

    // Cathedral candles.
    for (let i = 0; i < 5; i++) {
      const cx = cathedral.x - 40 + i * 22;
      const cy = cathedral.y + (i % 2) * 10;
      const pulse = 0.92 + 0.08 * Math.sin(phase * 2.2 + i);
      fx.fillStyle(0xa8c8ff, 0.16 * pulse);
      fx.fillCircle(cx, cy, 10);
      fx.fillStyle(0xfff0d0, 0.7 * pulse);
      fx.fillCircle(cx, cy - 4, 2.2);
    }

    // Harbor water lanterns.
    for (let i = 0; i < 4; i++) {
      const a = phase * 0.7 + i * 1.4;
      const hx = harbor.x - 40 + Math.cos(a) * (36 + i * 10);
      const hy = harbor.y + 48 + Math.sin(a * 0.8) * 14;
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(phase * 2 + i));
      fx.fillStyle(0x88c8ff, 0.2 * pulse);
      fx.fillEllipse(hx, hy, 18, 8);
      fx.fillStyle(0xe8f8ff, 0.45 * pulse);
      fx.fillCircle(hx, hy - 2, 2);
    }

    if (gfx.havenVignettes) {
      const gx = harborGuest.x;
      const gy = harborGuest.y - 8;
      fx.fillStyle(0xffc878, 0.25);
      fx.fillCircle(gx - 8, gy - 10, 6);
      fx.fillCircle(gx + 10, gy - 8, 6);
      fx.fillStyle(0xfff4d0, 0.7);
      fx.fillCircle(gx - 8, gy - 12, 2);
      fx.fillCircle(gx + 10, gy - 10, 2);
    }

    // Informant alley lamp.
    const alley = 0.92 + 0.08 * Math.sin(phase * 1.8);
    fx.fillStyle(0x8060a0, 0.14 * alley);
    fx.fillCircle(informant.x, informant.y - 18, 22);
    fx.fillStyle(0xe8d0ff, 0.35 * alley);
    fx.fillCircle(informant.x, informant.y - 22, 3);
  };

  let lastDrawAt = -Infinity;
  drawNight(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 3600,
    repeat: -1,
    onUpdate: (tw) => {
      if (!night || scene.time.now - lastDrawAt < 100) return;
      lastDrawAt = scene.time.now;
      drawNight(tw.getValue() ?? 0);
    },
  });

  const apply = () => {
    const sched = getHavenSchedule();
    night = havenNightlifeActive(sched?.restActive, getWorldGameHour());
    for (const o of nightObjs) o.setVisible(night);
    if (!night) fx.clear();
    else drawNight(0);
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsub);
}
