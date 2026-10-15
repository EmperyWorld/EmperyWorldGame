/**
 * Residential courtyard life: basketball, sandbox, well gossip, stray cat.
 */
import Phaser from 'phaser';
import { Depth, entityDepth } from '../game/constants/depth.js';
import { placeWorldProp } from './place-world-prop.js';
import { COMBAT_ATLAS_KEY, registerCombatSprites, registerCitizenSprite } from './sprite-factory.js';
import { setupSpriteDisplay } from './sprite-loader.js';
import { attachEntityShadow, syncEntityShadow } from './visual-polish.js';
import { getHavenSchedule, subscribeHavenSchedule } from '../world-clock.js';
import { loopDecorCounter } from './decor-fx.js';
import { COURT_PLAYERS_KEY } from './haven-citizens.js';
import { HAVEN_RESIDENTIAL_COURT } from '@empery/shared';
import { placeResidentialAnimal } from './residential-animal.js';

function allowClientDecorHumanoids(): boolean {
  try {
    // Strict mode by default: humanoid life must come from server schedule.
    return new URLSearchParams(window.location.search).has('decorHumanoids');
  } catch {
    return false;
  }
}

function pickFrame(scene: Phaser.Scene, preferred: string[]): string | null {
  if (!scene.textures.exists(COMBAT_ATLAS_KEY)) return null;
  const atlas = scene.textures.get(COMBAT_ATLAS_KEY);
  for (const f of preferred) {
    if (atlas.has(f)) return f;
  }
  const names = atlas.getFrameNames();
  return names.find((n) => n.startsWith('npc-') && n.endsWith('-0')) ?? names[0] ?? null;
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
    const individual=registerCitizenSprite(scene,`decor-haven-residential-${Math.round(x)}-${Math.round(y)}-${preferred[0]}`,frame);
    const spr = scene.add.sprite(x, y, individual.texture, individual.frame).setDepth(entityDepth(y));
    spr.setData('citizenIdentity',individual.prefix);
    setupSpriteDisplay(spr, scale);
    void tint;
    attachEntityShadow(scene, spr, scale > 0.75 ? 18 : 14, scale > 0.75 ? 7 : 6, 0.2);
    return spr;
  }
  const w = scale > 0.75 ? 22 : 18;
  const h = scale > 0.75 ? 30 : 24;
  return scene.add.rectangle(x, y, w, h, 0xe8c090, 1).setDepth(entityDepth(y));
}

type Actor = {
  body: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  ox: number;
  oy: number;
  bob?: Phaser.Tweens.Tween;
};

function hideActors(list: Actor[], originX: number, originY: number): void {
  for (const a of list) {
    a.bob?.stop();
    a.bob = undefined;
    a.body.setVisible(false);
    a.body.setPosition(originX + a.ox, originY + a.oy);
  }
}

/**
 * Neighborhood basketball court. Kids play during the day; clear out at night rest.
 * Parents sit on the side benches and watch.
 */
export function placeHavenResidentialCourt(scene: Phaser.Scene, x: number, y: number): void {
  try {
    registerCombatSprites(scene, 'human');
  } catch {
    /* atlas may already exist */
  }

  // Soft lawn fringe + asphalt pad under the court prop
  const ground = scene.add.graphics().setDepth(2);
  ground.fillStyle(0x3a5a38, 0.18);
  ground.fillEllipse(x, y + 8, 250, 180);
  ground.fillStyle(0x4a4840, 0.3);
  ground.fillRoundedRect(x - 100, y - 70, 200, 140, 10);
  ground.fillStyle(0x5a5850, 0.16);
  ground.fillRoundedRect(x - 90, y - 62, 180, 124, 8);
  ground.lineStyle(2, 0xd4c090, 0.35);
  ground.strokeRect(x - 36, y - 48, 72, 96);
  ground.strokeCircle(x, y, 22);

  const court = placeWorldProp(scene, 'prop_basketball_court', x, y, HAVEN_RESIDENTIAL_COURT.size);
  if (!court) {
    const hoops = scene.add.graphics().setDepth(entityDepth(y));
    for (const side of [-1, 1] as const) {
      const hx = x + side * 95;
      hoops.fillStyle(0x8a8070, 0.9);
      hoops.fillRect(hx - 3, y - 70, 6, 90);
      hoops.fillStyle(0xe8e0d0, 0.95);
      hoops.fillRect(hx - 18, y - 78, 36, 22);
      hoops.lineStyle(2, 0xff8844, 0.9);
      hoops.strokeCircle(hx, y - 62, 10);
    }
  }


  const ball = scene.add.circle(x, y, 6, 0xe07830, 1).setVisible(false);
  ball.setStrokeStyle(1, 0x2a2018, 0.8);
  const label = scene.add.text(x, y + 98, 'дети играют', {
    color: '#e8d8b0', fontSize: '11px', backgroundColor: '#00000088', padding: { x: 5, y: 2 },
  }).setOrigin(0.5, 0).setDepth(Depth.FloatText).setVisible(false);
  let elapsed = 0;
  const update = (_time: number, delta: number) => {
    elapsed += Math.min(250, delta);
    const getPlayers = scene.data.get(COURT_PLAYERS_KEY) as (() => Array<{ x: number; y: number }>) | undefined;
    const players = (getPlayers?.() ?? []).filter(p => Math.abs(p.x - x) < 110 && Math.abs(p.y - y) < 90);
    const playing = players.length >= 2 && getHavenSchedule()?.restActive === false;
    ball.setVisible(playing);
    label.setVisible(playing);
    if (!playing) return;
    const pass = elapsed / 900, t = pass % 1;
    const from = players[Math.floor(pass) % players.length]!;
    const to = players[(Math.floor(pass) + 1) % players.length]!;
    ball.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - 12 - Math.sin(t * Math.PI) * 16);
    ball.setDepth(entityDepth(from.y + (to.y - from.y) * t) + 0.01);
  };
  scene.events.on('update', update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off('update', update);
    ball.destroy(); label.destroy();
  });
}

/** Neighbors chatting at the well by day. */
function placeWellGossip(scene: Phaser.Scene, x: number, y: number): void {
  const prefs = ['npc-town_innkeeper-0', 'npc-town_healer-0', 'npc-town_stable-0'];
  const seats = [
    { ox: -36, oy: 10, flip: false, tint: 0xf2e0c8 },
    { ox: 34, oy: 14, flip: true, tint: 0xe8f0e0 },
  ];
  const people: Actor[] = [];
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i]!;
    const body = makePerson(scene, x + s.ox, y + s.oy, [prefs[i]!], 0.8, s.tint);
    if (body instanceof Phaser.GameObjects.Sprite) body.setFlipX(s.flip);
    people.push({ body, ox: s.ox, oy: s.oy });
  }

  const chat = scene.add
    .text(x, y - 48, 'у колодца', {
      color: '#d8d0c0',
      fontSize: '10px',
      backgroundColor: '#00000066',
      padding: { x: 4, y: 1 },
    })
    .setOrigin(0.5, 1)
    .setDepth(Depth.FloatText);

  const tweens: Phaser.Tweens.Tween[] = [];
  let active = false;

  const stop = () => {
    active = false;
    for (const t of tweens) t.stop();
    tweens.length = 0;
    hideActors(people, x, y);
    chat.setVisible(false);
  };

  const start = () => {
    if (active) return;
    active = true;
    chat.setVisible(true);
    for (const p of people) {
      p.body.setVisible(true);
      p.body.setPosition(x + p.ox, y + p.oy);
      const bob = scene.tweens.add({
        targets: p.body,
        y: y + p.oy - 3,
        duration: 700 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          p.body.setDepth(entityDepth(p.body.y));
          if (p.body instanceof Phaser.GameObjects.Sprite) syncEntityShadow(p.body);
        },
      });
      p.bob = bob;
      tweens.push(bob);
    }
  };

  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) start();
    else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Toddler digging in the sandbox by day. */
function placeSandboxToddler(scene: Phaser.Scene, x: number, y: number): void {
  const kid = makePerson(scene, x, y, ['npc-town_radio-0'], 0.58, 0xffe8c8);
  if (kid instanceof Phaser.GameObjects.Sprite) kid.setFlipX(true);
  const bucket = scene.add.circle(x + 14, y + 8, 5, 0xc07040, 1).setDepth(entityDepth(y) + 0.2);
  bucket.setStrokeStyle(1, 0x3a2818, 0.7);

  const actors: Actor[] = [{ body: kid, ox: 0, oy: 0 }];
  let bob: Phaser.Tweens.Tween | undefined;
  let dig: Phaser.Tweens.Tween | undefined;

  const stop = () => {
    bob?.stop();
    dig?.stop();
    bob = undefined;
    dig = undefined;
    hideActors(actors, x, y);
    bucket.setVisible(false);
  };

  const start = () => {
    kid.setVisible(true);
    kid.setPosition(x, y);
    bucket.setVisible(true);
    bob = scene.tweens.add({
      targets: kid,
      y: y - 3,
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        kid.setDepth(entityDepth(kid.y));
        if (kid instanceof Phaser.GameObjects.Sprite) syncEntityShadow(kid);
      },
    });
    dig = scene.tweens.add({
      targets: bucket,
      y: y + 4,
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => bucket.setDepth(entityDepth(bucket.y) + 0.2),
    });
  };

  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) start();
    else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Ground animals share collision-aware street movement with residents. */
function placeStrayCat(scene: Phaser.Scene, path: Array<{ x: number; y: number }>, color = 0xc8a878): void {
  placeResidentialAnimal(scene, path, 'cat', color);
}

/** Corner shop vendor by day (near prop_house_corner_shop @ 10,45). */
function placeCornerShopVendor(scene: Phaser.Scene, x: number, y: number): void {
  const vendor = makePerson(scene, x, y, ['npc-town_merchant-0'], 0.84, 0xffe8d0);
  const crate = scene.add.rectangle(x + 22, y + 10, 16, 12, 0x8a6840, 1).setDepth(entityDepth(y));
  crate.setStrokeStyle(1, 0x3a2818, 0.6);
  const label = scene.add
    .text(x, y - 36, 'лавка', {
      color: '#e8d8b0',
      fontSize: '10px',
      backgroundColor: '#00000066',
      padding: { x: 4, y: 1 },
    })
    .setOrigin(0.5, 1)
    .setDepth(Depth.FloatText);

  let bob: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    bob?.stop();
    bob = undefined;
    vendor.setVisible(false);
    crate.setVisible(false);
    label.setVisible(false);
  };
  const start = () => {
    vendor.setVisible(true);
    crate.setVisible(true);
    label.setVisible(true);
    vendor.setPosition(x, y);
    bob = scene.tweens.add({
      targets: vendor,
      y: y - 2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        vendor.setDepth(entityDepth(vendor.y));
        if (vendor instanceof Phaser.GameObjects.Sprite) syncEntityShadow(vendor);
      },
    });
  };
  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) start();
    else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Neighbors eating at the courtyard table by day. */
function placeTableDiners(scene: Phaser.Scene, x: number, y: number): void {
  const prefs = ['npc-town_brewer-0', 'npc-town_teacher-0'];
  const seats = [
    { ox: -22, oy: 6, flip: false, tint: 0xf0e0d0 },
    { ox: 24, oy: 8, flip: true, tint: 0xe0f0e8 },
  ];
  const people: Actor[] = [];
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i]!;
    const body = makePerson(scene, x + s.ox, y + s.oy, [prefs[i]!], 0.78, s.tint);
    if (body instanceof Phaser.GameObjects.Sprite) body.setFlipX(s.flip);
    people.push({ body, ox: s.ox, oy: s.oy });
  }
  const tweens: Phaser.Tweens.Tween[] = [];
  let active = false;
  const stop = () => {
    active = false;
    for (const t of tweens) t.stop();
    tweens.length = 0;
    hideActors(people, x, y);
  };
  const start = () => {
    if (active) return;
    active = true;
    for (const p of people) {
      p.body.setVisible(true);
      p.body.setPosition(x + p.ox, y + p.oy);
      const bob = scene.tweens.add({
        targets: p.body,
        y: y + p.oy - 2,
        duration: 900 + Math.random() * 200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          p.body.setDepth(entityDepth(p.body.y));
          if (p.body instanceof Phaser.GameObjects.Sprite) syncEntityShadow(p.body);
        },
      });
      p.bob = bob;
      tweens.push(bob);
    }
  };
  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) start();
    else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Soft laundry flutter near clotheslines. */
function placeLaundryFlutter(scene: Phaser.Scene, spots: Array<{ x: number; y: number }>): void {
  const fx = scene.add.graphics().setDepth(Depth.Ambient);
  const draw = (phase: number) => {
    fx.clear();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      const sway = Math.sin(phase * 2 + i) * 4;
      fx.fillStyle(0xe8e0d8, 0.35);
      fx.fillRect(s.x - 18 + sway, s.y - 10, 10, 16);
      fx.fillStyle(0xc8d8e8, 0.3);
      fx.fillRect(s.x - 4 + sway * 0.6, s.y - 8, 9, 14);
      fx.fillStyle(0xe8c8c0, 0.28);
      fx.fillRect(s.x + 10 + sway * 0.4, s.y - 12, 11, 18);
    }
  };
  draw(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2400,
    repeat: -1,
    onUpdate: (tw) => draw(tw.getValue() ?? 0),
  });
}

/** Pigeons circling the coop. */
function placePigeons(scene: Phaser.Scene, cx: number, cy: number): void {
  const birds: Phaser.GameObjects.Ellipse[] = [];
  for (let i = 0; i < 3; i++) {
    const b = scene.add.ellipse(cx, cy, 7, 4, 0xb0a898, 1).setDepth(entityDepth(cy) + 2);
    birds.push(b);
  }
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 5200,
    repeat: -1,
    onUpdate: (tw) => {
      const phase = tw.getValue() ?? 0;
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i]!;
        const a = phase + i * 2.1;
        const r = 28 + i * 8;
        b.setPosition(cx + Math.cos(a) * r, cy - 20 + Math.sin(a * 1.4) * 12);
        b.setDepth(entityDepth(b.y) + 2);
      }
    },
  });
}

/** Ripple rings on the well water. */
function placeWellRipple(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(3);
  loopDecorCounter(scene, {
    from: 0,
    to: 1,
    duration: 2200,
    repeat: -1,
    onUpdate: (tw) => {
      const t = tw.getValue() ?? 0;
      g.clear();
      for (let i = 0; i < 3; i++) {
        const u = (t + i * 0.33) % 1;
        g.lineStyle(1.5, 0xa8c8d8, 0.28 * (1 - u));
        g.strokeEllipse(x, y - 6, 18 + u * 36, 10 + u * 18);
      }
    },
  });
}

/** Night fireflies around the courtyard. */
function placeResidentialNightAmbience(
  scene: Phaser.Scene,
  fireflyOrigin: { x: number; y: number },
): void {
  const bugs = scene.add.graphics().setDepth(Depth.Ambient);
  let night = false;
  const drawBugs = (phase: number) => {
    bugs.clear();
    if (!night) return;
    for (let i = 0; i < 10; i++) {
      const a = phase * 1.3 + i * 0.7;
      const ox = fireflyOrigin.x + Math.cos(a + i) * (40 + (i % 4) * 18);
      const oy = fireflyOrigin.y + Math.sin(a * 1.5 + i * 0.5) * (28 + (i % 3) * 12);
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(phase * 3 + i));
      bugs.fillStyle(0xd8f060, 0.45 * pulse);
      bugs.fillCircle(ox, oy, 2.2);
    }
  };
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 4000,
    repeat: -1,
    onUpdate: (tw) => drawBugs(tw.getValue() ?? 0),
  });

  const apply = () => {
    const sched = getHavenSchedule();
    night = Boolean(sched?.restActive);
    if (!night) bugs.clear();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsub);
}

function placeYardDog(scene: Phaser.Scene, path: Array<{ x: number; y: number }>): void {
  placeResidentialAnimal(scene, path, 'dog', 0x8a6848);
}

/** Kid hopping the chalk grid by day. */
function placeHopscotchKid(scene: Phaser.Scene, x: number, y: number): void {
  const kid = makePerson(scene, x - 20, y, ['npc-town_healer-0'], 0.6, 0xfff0d8);
  const pads = [
    { x: x - 24, y: y + 8 },
    { x: x - 8, y: y - 4 },
    { x: x + 8, y: y + 8 },
    { x: x + 20, y: y - 6 },
    { x: x + 4, y: y + 14 },
  ];
  let i = 0;
  let active = false;
  let hop: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    active = false;
    hop?.stop();
    kid.setVisible(false);
  };
  const bounce = () => {
    if (!active) return;
    const to = pads[i % pads.length]!;
    i += 1;
    hop = scene.tweens.add({
      targets: kid,
      x: to.x,
      y: to.y - 8,
      duration: 280,
      yoyo: true,
      onUpdate: () => {
        kid.setDepth(entityDepth(kid.y));
        if (kid instanceof Phaser.GameObjects.Sprite) syncEntityShadow(kid);
      },
      onComplete: () => {
        kid.setPosition(to.x, to.y);
        if (active) scene.time.delayedCall(120, bounce);
      },
    });
  };
  const start = () => {
    if (active) return;
    active = true;
    kid.setVisible(true);
    bounce();
  };
  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) start();
    else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Street musician by the district gate (day). */
function placeGateMusician(scene: Phaser.Scene, x: number, y: number): void {
  placeWorldProp(scene, 'prop_bench', x, y + 8, 52);
  const muse = makePerson(scene, x, y, ['npc-town_radio-0'], 0.8, 0xe8d8f0);
  const notes = scene.add.graphics().setDepth(Depth.FloatText);
  let bob: Phaser.Tweens.Tween | undefined;
  let noteTw: Phaser.Tweens.Tween | null | undefined;
  const stop = () => {
    bob?.stop();
    noteTw?.stop();
    muse.setVisible(false);
    notes.clear();
  };
  const start = () => {
    muse.setVisible(true);
    muse.setPosition(x, y);
    bob = scene.tweens.add({
      targets: muse,
      y: y - 3,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        muse.setDepth(entityDepth(muse.y));
        if (muse instanceof Phaser.GameObjects.Sprite) syncEntityShadow(muse);
      },
    });
    noteTw = loopDecorCounter(scene, {
      from: 0,
      to: Math.PI * 2,
      duration: 2000,
      repeat: -1,
      onUpdate: (tw) => {
        const p = tw.getValue() ?? 0;
        notes.clear();
        for (let i = 0; i < 3; i++) {
          const t = (p + i * 0.9) % (Math.PI * 2);
          const rise = ((t / (Math.PI * 2)) * 28) % 28;
          notes.fillStyle(0xffe8a0, 0.45 * (1 - rise / 28));
          notes.fillCircle(x + 14 + i * 6, y - 20 - rise, 3);
        }
      },
    });
  };
  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) start();
    else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Daytime delivery runner looping the courtyard. */
function placeDeliveryRunner(scene: Phaser.Scene, path: Array<{ x: number; y: number }>): void {
  if (path.length < 2) return;
  const start = path[0]!;
  const runner = makePerson(scene, start.x, start.y, ['npc-town_stable-0'], 0.82, 0xf0e0c8);
  const crate = scene.add.rectangle(start.x + 12, start.y + 4, 12, 10, 0x7a5838, 1).setDepth(entityDepth(start.y));
  let idx = 1;
  let active = false;
  let loop: (() => void) | undefined;
  const stop = () => {
    active = false;
    runner.setVisible(false);
    crate.setVisible(false);
  };
  const walk = () => {
    if (!active) return;
    const to = path[idx % path.length]!;
    idx += 1;
    scene.tweens.add({
      targets: [runner, crate],
      x: to.x,
      y: to.y,
      duration: 3200,
      ease: 'Linear',
      onUpdate: () => {
        runner.setDepth(entityDepth(runner.y));
        crate.setDepth(entityDepth(runner.y));
        crate.setPosition(runner.x + 12, runner.y + 4);
        if (runner instanceof Phaser.GameObjects.Sprite) {
          runner.setFlipX(to.x < runner.x - 2);
          syncEntityShadow(runner);
        }
      },
      onComplete: () => {
        if (active) scene.time.delayedCall(600, walk);
      },
    });
  };
  loop = walk;
  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) {
      if (!active) {
        active = true;
        runner.setVisible(true);
        crate.setVisible(true);
        loop?.();
      }
    } else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Night watchman with lantern. */
function placeNightWatchman(scene: Phaser.Scene, path: Array<{ x: number; y: number }>): void {
  if (path.length < 2) return;
  const start = path[0]!;
  const guard = makePerson(scene, start.x, start.y, ['npc-town_guard-0'], 0.9, 0xd0d8e8);
  const lamp = scene.add.circle(start.x + 14, start.y - 8, 5, 0xffc878, 1).setDepth(entityDepth(start.y) + 1);
  const glow = scene.add.circle(start.x + 14, start.y - 8, 28, 0xffaa55, 0.14).setDepth(Depth.Ambient);
  let idx = 1;
  let active = false;
  const stop = () => {
    active = false;
    guard.setVisible(false);
    lamp.setVisible(false);
    glow.setVisible(false);
  };
  const walk = () => {
    if (!active) return;
    const to = path[idx % path.length]!;
    idx += 1;
    scene.tweens.add({
      targets: [guard, lamp, glow],
      x: to.x,
      y: to.y,
      duration: 4000,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        guard.setDepth(entityDepth(guard.y));
        lamp.setPosition(guard.x + 14, guard.y - 8);
        lamp.setDepth(entityDepth(guard.y) + 1);
        glow.setPosition(lamp.x, lamp.y);
        if (guard instanceof Phaser.GameObjects.Sprite) {
          guard.setFlipX(to.x < guard.x - 2);
          syncEntityShadow(guard);
        }
      },
      onComplete: () => {
        if (active) scene.time.delayedCall(400, walk);
      },
    });
  };
  const apply = () => {
    const sched = getHavenSchedule();
    if (sched?.restActive) {
      if (!active) {
        active = true;
        guard.setVisible(true);
        lamp.setVisible(true);
        glow.setVisible(true);
        walk();
      }
    } else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Warm glow under courtyard string lights — brighter at night. */
function placeStringLightGlow(scene: Phaser.Scene, spots: Array<{ x: number; y: number }>): void {
  const g = scene.add.graphics().setDepth(3);
  let night = false;
  const draw = (phase: number) => {
    g.clear();
    const a = night ? 1 : 0.35;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      const pulse = 0.7 + 0.3 * Math.sin(phase * 2 + i);
      g.fillStyle(0xffc878, 0.12 * a * pulse);
      g.fillEllipse(s.x, s.y + 10, 140, 50);
      for (let b = -3; b <= 3; b++) {
        g.fillStyle(0xffe0a0, 0.2 * a * pulse);
        g.fillCircle(s.x + b * 16, s.y - 6, 3);
      }
    }
  };
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2200,
    repeat: -1,
    onUpdate: (tw) => draw(tw.getValue() ?? 0),
  });
  const apply = () => {
    const sched = getHavenSchedule();
    night = Boolean(sched?.restActive);
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsub);
}

/** Residential animals and cosmetic effects; families use the shared ambient schedule. */
export function placeHavenResidentialLife(scene: Phaser.Scene): void {
  try {
    registerCombatSprites(scene, 'human');
  } catch {
    /* atlas may already exist */
  }

  const tw = 64;
  const px = (tx: number, ty: number) => [tx * tw + 32, ty * tw + 32] as const;
  const allowDecorHumanoids = allowClientDecorHumanoids();

  const { x: courtX, y: courtY } = HAVEN_RESIDENTIAL_COURT;

  // Было (13,45) — пусто (реальный колодец давно переехал); теперь совпадает
  // с prop_neighborhood_well.
  const [wellX, wellY] = px(17, 38);
  if (allowDecorHumanoids) placeWellGossip(scene, wellX, wellY + 18);
  placeWellRipple(scene, wellX, wellY);

  const [sandX, sandY] = px(18, 46);
  if (allowDecorHumanoids) placeSandboxToddler(scene, sandX - 8, sandY + 6);
  // Было (17,45) — прямо внутри tenement_block (ребёнок «стоял в доме»).
  if (allowDecorHumanoids) placeHopscotchKid(scene, px(16, 46)[0], px(16, 46)[1]);

  placeStrayCat(scene, [
    { x: px(11, 45)[0], y: px(11, 45)[1] }, // было (12,44) — внутри prop_house_row
    { x: px(15, 46)[0], y: px(15, 46)[1] },
    { x: px(20, 44)[0], y: px(20, 44)[1] }, // было (19,45) — внутри tenement
    { x: px(20, 45)[0], y: px(20, 45)[1] }, // было (22,47) — внутри prop_house_stucco
    { x: px(18, 47)[0], y: px(18, 47)[1] }, // было (17,48) — внутри prop_house_bay
    { x: px(9, 45)[0], y: px(9, 45)[1] }, // было (11,47) — внутри prop_house_blue
  ]);
  placeStrayCat(
    scene,
    [
      { x: px(24, 41)[0], y: px(24, 41)[1] }, // было (25,42) — внутри prop_house_manor
      { x: px(27, 45)[0], y: px(27, 45)[1] }, // было (28,44) — внутри prop_house_villa
      { x: px(25, 45)[0], y: px(25, 45)[1] }, // было (27,47) — внутри prop_house_redroof
      { x: px(23, 45)[0], y: px(23, 45)[1] },
    ],
    0x908070,
  );

  placeYardDog(scene, [
    { x: px(25, 41)[0], y: px(25, 41)[1] + 20 }, // было (27,43) — внутри prop_house_villa
    { x: px(28, 45)[0], y: px(28, 45)[1] },
    { x: px(25, 45)[0], y: px(25, 45)[1] }, // было (26,46) — внутри prop_house_corner_shop
    { x: px(26, 45)[0], y: px(26, 45)[1] }, // было (27,44) — внутри prop_house_villa
  ]);
  if (allowDecorHumanoids) {
    placeGateMusician(scene, px(16, 36)[0] - 48, px(16, 36)[1] + 24);
    placeDeliveryRunner(scene, [
      { x: px(16, 36)[0], y: px(16, 36)[1] + 10 },
      { x: px(13, 37)[0], y: px(13, 37)[1] },
      { x: px(11, 41)[0], y: px(11, 41)[1] },
      { x: px(12, 45)[0], y: px(12, 45)[1] },
      { x: px(12, 45)[0], y: px(12, 45)[1] + 24 },
      { x: px(10, 45)[0], y: px(10, 45)[1] },
      { x: px(17, 46)[0], y: px(17, 46)[1] },
      { x: px(18, 38)[0], y: px(18, 38)[1] },
      { x: px(16, 36)[0], y: px(16, 36)[1] + 10 },
    ]);
    placeNightWatchman(scene, [
      { x: px(8, 40)[0], y: px(8, 40)[1] },
      { x: px(10, 42)[0], y: px(10, 42)[1] },
      { x: px(11, 45)[0], y: px(11, 45)[1] },
      { x: px(12, 45)[0], y: px(12, 45)[1] },
      { x: px(15, 46)[0], y: px(15, 46)[1] },
      { x: px(17, 46)[0], y: px(17, 46)[1] },
      { x: px(20, 46)[0], y: px(20, 46)[1] },
      { x: px(22, 46)[0], y: px(22, 46)[1] },
      { x: px(24, 45)[0], y: px(24, 45)[1] },
      { x: px(27, 45)[0], y: px(27, 45)[1] },
      { x: px(24, 46)[0], y: px(24, 46)[1] },
      { x: px(21, 46)[0], y: px(21, 46)[1] },
      { x: px(18, 48)[0], y: px(18, 48)[1] },
      { x: px(13, 47)[0], y: px(13, 47)[1] },
      { x: px(12, 45)[0], y: px(12, 45)[1] },
      { x: px(11, 42)[0], y: px(11, 42)[1] },
      { x: px(13, 40)[0], y: px(13, 40)[1] },
      { x: px(13, 37)[0], y: px(13, 37)[1] },
      { x: px(15, 35)[0], y: px(15, 35)[1] },
      { x: px(16, 36)[0], y: px(16, 36)[1] + 20 },
      { x: px(18, 38)[0], y: px(18, 38)[1] },
      { x: px(20, 40)[0], y: px(20, 40)[1] },
      { x: px(20, 43)[0], y: px(20, 43)[1] },
      { x: px(18, 44)[0], y: px(18, 44)[1] },
      { x: px(15, 45)[0], y: px(15, 45)[1] },
      { x: px(12, 45)[0], y: px(12, 45)[1] },
      { x: px(10, 43)[0], y: px(10, 43)[1] },
      { x: px(8, 40)[0], y: px(8, 40)[1] },
    ]);
  }
  placeStringLightGlow(scene, [
    { x: px(15, 35)[0], y: px(15, 35)[1] },
    { x: px(20, 43)[0], y: px(20, 43)[1] }, // было (21,44) — внутри prop_house_townhouse
  ]);

  // Corner shop переехал на (25,47) — было (10,45), лавочник стоял у чужого дома
  if (allowDecorHumanoids) placeCornerShopVendor(scene, px(25, 47)[0] + 8, px(25, 47)[1] + 70);
  if (allowDecorHumanoids) placeTableDiners(scene, px(13, 46)[0], px(13, 46)[1] + 8);
  placePigeons(scene, px(5, 45)[0], px(5, 45)[1]); // было (8,48) — внутри prop_house_duplex
  placeLaundryFlutter(scene, [
    { x: px(7, 41)[0], y: px(7, 41)[1] },
    { x: px(27, 45)[0], y: px(27, 45)[1] }, // было (28,46) — внутри prop_house_redroof
    { x: px(24, 40)[0], y: px(24, 40)[1] },
  ]);
  placeResidentialNightAmbience(scene, { x: courtX, y: courtY });

  // Fountain sparkle — было (13,48) (пусто), реальный prop_yard_fountain теперь @ (19,46)
  const [fx, fy] = px(19, 46);
  const sparkle = scene.add.graphics().setDepth(4);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 1800,
    repeat: -1,
    onUpdate: (tw) => {
      const p = tw.getValue() ?? 0;
      sparkle.clear();
      sparkle.fillStyle(0xc8e8f8, 0.25 + 0.2 * Math.sin(p * 3));
      sparkle.fillCircle(fx, fy - 8, 6);
      sparkle.fillStyle(0xe8f8ff, 0.2);
      sparkle.fillCircle(fx + Math.cos(p) * 5, fy - 14 - Math.sin(p) * 3, 2.5);
    },
  });

  // Soft district plaque near the north gate
  const [gateX, gateY] = px(16, 36);
  scene.add
    .text(gateX, gateY + 42, 'спальный квартал', {
      color: '#d8c8a0',
      fontSize: '11px',
      fontStyle: 'bold',
      backgroundColor: '#00000077',
      padding: { x: 6, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  if (allowDecorHumanoids) placeLaundryWorker(scene, px(7, 41)[0] + 20, px(7, 41)[1] + 16);
  placePumpDrip(scene, px(15, 46)[0], px(15, 46)[1]);
  placeAlleyDust(scene, courtX - 80, courtY - 40);
}

/** Neighbor hanging laundry by day. */
function placeLaundryWorker(scene: Phaser.Scene, x: number, y: number): void {
  const worker = makePerson(scene, x, y, ['npc-town_innkeeper-0'], 0.78, 0xf0e8d8);
  let bob: Phaser.Tweens.Tween | undefined;
  const stop = () => {
    bob?.stop();
    worker.setVisible(false);
  };
  const start = () => {
    worker.setVisible(true);
    worker.setPosition(x, y);
    bob = scene.tweens.add({
      targets: worker,
      x: x + 18,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        worker.setDepth(entityDepth(worker.y));
        if (worker instanceof Phaser.GameObjects.Sprite) {
          worker.setFlipX(worker.x > x + 8);
          syncEntityShadow(worker);
        }
      },
    });
  };
  const apply = () => {
    const sched = getHavenSchedule();
    if (!(sched?.restActive ?? false)) start();
    else stop();
  };
  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    stop();
  });
}

/** Water droplets from the neighborhood pump. */
function placePumpDrip(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(4);
  loopDecorCounter(scene, {
    from: 0,
    to: 1,
    duration: 1400,
    repeat: -1,
    onUpdate: (tw) => {
      const t = tw.getValue() ?? 0;
      g.clear();
      for (let i = 0; i < 3; i++) {
        const u = (t + i * 0.33) % 1;
        g.fillStyle(0xa8d0e8, 0.45 * (1 - u));
        g.fillCircle(x + 6, y - 4 + u * 22, 2.2 - u * 0.8);
      }
      g.fillStyle(0x88b0c8, 0.2);
      g.fillEllipse(x + 6, y + 18, 16 + Math.sin(t * Math.PI * 2) * 2, 6);
    },
  });
}

/** Soft dust motes in the courtyard alley. */
function placeAlleyDust(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(3);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 6000,
    repeat: -1,
    onUpdate: (tw) => {
      const p = tw.getValue() ?? 0;
      g.clear();
      for (let i = 0; i < 8; i++) {
        const a = p + i * 0.8;
        g.fillStyle(0xd8c8a0, 0.08 + 0.06 * Math.sin(a * 2));
        g.fillCircle(x + Math.cos(a) * (30 + i * 8), y + Math.sin(a * 0.7) * (18 + i * 4), 2);
      }
    },
  });
}

/**
 * Tenement balconies: residents lean out by day; curtains/glow by night.
 * Called from location-decor after the tenement block is placed.
 */
export function placeHavenTenementLife(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
): void {
  try {
    registerCombatSprites(scene, 'human');
  } catch {
    /* atlas may already exist */
  }

  const balconyY = y - size * 0.12;
  const allowDecorHumanoids = allowClientDecorHumanoids();
  const seats = [-0.28, -0.1, 0.08, 0.26].map((fx, i) => ({
    x: x + size * fx,
    y: balconyY - (i % 2) * 10,
    tint: [0xffe0c8, 0xe8f0ff, 0xf0e0d0, 0xe0ffe8][i]!,
    pref: ['npc-town_merchant-0', 'npc-town_healer-0', 'npc-town_teacher-0', 'npc-town_radio-0'][i]!,
  }));

  const people: Actor[] = [];
  for (const s of seats) {
    const body = makePerson(scene, s.x, s.y, [s.pref], 0.55, s.tint);
    people.push({ body, ox: s.x - x, oy: s.y - y });
  }

  // Hanging rugs / laundry from mid facade
  const rugs = scene.add.graphics().setDepth(entityDepth(y - size * 0.05));
  const drawRugs = (phase: number, show: boolean) => {
    rugs.clear();
    if (!show) return;
    for (let i = 0; i < 5; i++) {
      const sway = Math.sin(phase * 1.8 + i) * 3;
      const rx = x - size * 0.28 + i * (size * 0.12);
      const ry = y - size * 0.02;
      rugs.fillStyle([0xb04040, 0x4060a0, 0xc09040, 0x508050, 0xa06080][i]!, 0.55);
      rugs.fillRect(rx + sway, ry, 14, 22 + (i % 3) * 3);
    }
  };

  const label = scene.add
    .text(x + size * 0.24, y + size * 0.22, 'Дом жильцов · ключи у Эдмунда →', {
      color: '#e8d8b0',
      fontSize: '11px',
      fontStyle: 'bold',
      backgroundColor: '#00000088',
      padding: { x: 6, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  const doorSign = scene.add
    .text(x - size * 0.08, y - size * 0.46, '↑ арка · квартиры', {
      color: '#c8b890',
      fontSize: '10px',
      backgroundColor: '#00000066',
      padding: { x: 4, y: 1 },
    })
    .setOrigin(0.5, 1)
    .setDepth(Depth.FloatText);

  const tweens: Phaser.Tweens.Tween[] = [];
  let day = true;

  const apply = () => {
    const sched = getHavenSchedule();
    day = allowDecorHumanoids && !(sched?.restActive ?? false);
    for (const p of people) {
      p.body.setVisible(day);
      if (day) {
        p.body.setPosition(x + p.ox, y + p.oy);
        p.bob?.stop();
        p.bob = scene.tweens.add({
          targets: p.body,
          y: y + p.oy - 2,
          duration: 900 + Math.random() * 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            p.body.setDepth(entityDepth(p.body.y) + 2);
            if (p.body instanceof Phaser.GameObjects.Sprite) syncEntityShadow(p.body);
          },
        });
        tweens.push(p.bob);
      } else {
        p.bob?.stop();
        p.bob = undefined;
      }
    }
    label.setVisible(true);
    doorSign.setVisible(true);
  };

  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2800,
    repeat: -1,
    onUpdate: (tw) => drawRugs(tw.getValue() ?? 0, day),
  });

  apply();
  const unsub = subscribeHavenSchedule(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsub();
    for (const t of tweens) t.stop();
  });
}
