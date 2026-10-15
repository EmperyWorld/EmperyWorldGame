import { placeGarrisonPalisade } from './garrison-palisade.js';
import { HAVEN_GARRISON_LAYOUT, HAVEN_GARRISON_PROPS,HAVEN_GARRISON_SOLDIERS } from '@empery/shared';
import { bindDecorShift } from './decor-shift.js';
import { cityCrowd } from '../game/systems/city-crowd.js';
import { resolveDecorAnchor } from './decor-anchor.js';
import { bindDecorSchedule } from './decor-schedule.js';
import { bindDecorPatrol } from './decor-patrol.js';
/**
 * Garrison camp: stew fire, fencing, archery, patrol — day/night.
 */
import Phaser from 'phaser';
import { Depth, entityDepth } from '../game/constants/depth.js';
import { placeWorldProp } from './place-world-prop.js';
import { COMBAT_ATLAS_KEY, registerCombatSprites, registerCitizenSprite } from './sprite-factory.js';
import { setupSpriteDisplay } from './sprite-loader.js';
import { attachEntityShadow } from './visual-polish.js';
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

function makeGuard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  preferred: string[],
  scale = 0.95,
  tint = 0xffffff,
  identity?: string,
): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
  const anchor=resolveDecorAnchor(scene,x,y);
  if(anchor){x=anchor.x;y=anchor.y;}
  const frame = pickFrame(scene, preferred);
  if (frame) {
    const individual=registerCitizenSprite(scene,identity??`decor-haven-garrison-${Math.round(x)}-${Math.round(y)}-${preferred[0]}`,frame);
    const spr = scene.add.sprite(x, y, individual.texture, individual.frame).setDepth(entityDepth(y));
    spr.setData('citizenIdentity',individual.prefix);
    setupSpriteDisplay(spr, scale);
    void tint;
    attachEntityShadow(scene, spr, 20, 8, 0.24);
    return spr;
  }
  return scene.add.rectangle(x, y, 26, 34, 0x6a7080, 1).setDepth(entityDepth(y));
}

function dayNight(
  scene: Phaser.Scene,
  onDay: () => void,
  onNight: () => void,
): void {
  bindDecorSchedule(scene,onDay,onNight);
}

/**
 * Full garrison plaza life around hearth (x, y) — typically 928, 672.
 */
export function placeHavenGarrison(scene: Phaser.Scene, x: number, y: number): void {
  try {
    registerCombatSprites(scene, 'human');
  } catch {
    /* atlas may already exist */
  }

  const layout=HAVEN_GARRISON_LAYOUT;
  const hx=layout.hearth.x,hy=layout.hearth.y;
  const shifts: Array<{atPost:boolean}> = [];
  const entrance=layout.entrance;
  placeGarrisonPalisade(scene);

  // Packed earth plaza + drill yard
  const ground = scene.add.graphics().setDepth(2);
  ground.fillStyle(0x5a5040, 0.2);
  ground.fillEllipse(x, y + 120, 620, 420);
  ground.fillStyle(0x7a6c58, 0.12);
  ground.fillEllipse(x, y + 8, 260, 170);
  ground.fillStyle(0x4a4840, 0.14);
  ground.fillEllipse(x + 140, y + 40, 200, 140);
  ground.fillStyle(0x3a5a38, 0.08);
  ground.fillEllipse(x - 100, y + 60, 160, 100);

  // Cobble paths on the plaza
  const paths = scene.add.graphics().setDepth(2);
  const segs: Array<readonly [number, number, number, number]> = [
    [x - 160, y - 40, x + 160, y - 40],
    [x - 40, y - 120, x - 40, y + 100],
    [x + 40, y - 120, x + 40, y + 100],
    [x - 120, y + 60, x + 160, y + 60],
  ];
  for (const [x1, y1, x2, y2] of segs) {
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      paths.fillStyle(0x4a4030, 0.2);
      paths.fillEllipse(px, py, 40, 22);
    }
  }

  for(const [id,px,py,size] of HAVEN_GARRISON_PROPS)placeWorldProp(scene,id,px,py,size);

  // Stew steam + fire glow
  const fx = scene.add.graphics().setDepth(Depth.Ambient);
  const drawHearth = (phase: number) => {
    fx.clear();
    const flicker = 0.5 + 0.5 * Math.sin(phase * 4);
    fx.fillStyle(0xff6622, 0.18 * flicker);
    fx.fillCircle(hx, hy - 4, 18 + flicker * 4);
    fx.fillStyle(0xffcc44, 0.28 * flicker);
    fx.fillCircle(hx, hy - 6, 8 + flicker * 2);
    for (let p = 0; p < 4; p++) {
      const t = (phase + p * 0.8) % (Math.PI * 2);
      const rise = ((t / (Math.PI * 2)) * 36) % 36;
      const ox = hx + 14 + Math.sin(t * 2 + p) * (3 + p);
      const oy = hy - 8 - rise;
      fx.fillStyle(0xd8e0d0, 0.14 * (1 - rise / 36));
      fx.fillCircle(ox, oy, 4 + p * 0.8 + rise * 0.06);
    }
    fx.fillStyle(0xf0e0b0, 0.2 + 0.15 * Math.sin(phase * 3));
    fx.fillCircle(hx + 20, hy - 2, 3);
  };
  drawHearth(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2800,
    repeat: -1,
    onUpdate: (tw) => drawHearth(tw.getValue() ?? 0),
  });

  const stewLabel = scene.add
    .text(hx + 8, hy + 28, 'похлёбка у костра', {
      color: '#e8d0a0',
      fontSize: '11px',
      fontStyle: 'bold',
      backgroundColor: '#00000088',
      padding: { x: 5, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  scene.tweens.add({
    targets: stewLabel,
    alpha: { from: 0.55, to: 1 },
    y: stewLabel.y - 4,
    duration: 1600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  const guardPrefs = ['npc-town_guard-0', 'npc-town_captain-0', 'npc-town_blacksmith-0'];

  // Sit around the fire
  const sitters: Array<{
    body: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
    ox: number;
    oy: number;
  }> = [];
  const sitSeats = layout.sitters.map(p=>({ox:p.x-x,oy:p.y-y,flip:p.x>hx}));
  for (let i = 0; i < sitSeats.length; i++) {
    const s = sitSeats[i]!;
    const g = makeGuard(scene, x + s.ox, y + s.oy, [guardPrefs[i % guardPrefs.length]!], 0.9);
    if (g instanceof Phaser.GameObjects.Sprite) {
      g.setFlipX(hx<g.x);
      const up = (g.frame.name as string).replace(/-(\d+)$/, '-up-$1');
      if (g.texture.has(up) && hy-g.y < -Math.abs(hx-g.x)*0.5) g.setFrame(up);
    }
    sitters.push({ body: g, ox: s.ox, oy: s.oy });
    const release=cityCrowd(scene).register(`garrison:meal:${i}`,()=>({x:g.x,y:g.y,active:g.active&&g.visible}));
    scene.events.once('shutdown',release);
    scene.tweens.add({
      targets: g,
      angle: { from: -2, to: 2 },
      duration: 900 + i * 120,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: i * 100,
    });
  }

  // Fencing pair
  const fx0 = (layout.fencing[0].x+layout.fencing[1].x)/2;
  const fy0 = layout.fencing[0].y;
  const left = makeGuard(scene, fx0 - 28, fy0, ['npc-town_guard-0', 'npc-town_captain-0'], 0.98);
  const right = makeGuard(scene, fx0 + 28, fy0, ['npc-town_captain-0', 'npc-town_guard-0'], 0.98);
  if (left instanceof Phaser.GameObjects.Sprite) left.setFlipX(false);
  if (right instanceof Phaser.GameObjects.Sprite) right.setFlipX(true);

  const blades = scene.add.graphics().setDepth(Depth.Ambient);
  let fencingOn = true;
  const drawBlades = (phase: number) => {
    blades.clear();
    if (!fencingOn || !shifts[0]?.atPost || !shifts[1]?.atPost) return;
    const swing = Math.sin(phase * 2) * 18;
    const clash = Math.abs(Math.sin(phase * 2)) > 0.92;
    blades.lineStyle(2.5, 0xd0d8e0, 0.9);
    blades.lineBetween(fx0 - 18, fy0 - 8, fx0 - 2 + swing * 0.3, fy0 - 14 - swing * 0.15);
    blades.lineBetween(fx0 + 18, fy0 - 8, fx0 + 2 - swing * 0.3, fy0 - 14 + swing * 0.15);
    if (clash) {
      blades.fillStyle(0xfff0c0, 0.55);
      blades.fillCircle(fx0, fy0 - 12, 5);
      blades.fillStyle(0xffffff, 0.35);
      blades.fillCircle(fx0, fy0 - 12, 2);
    }
  };
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 1400,
    repeat: -1,
    onUpdate: (tw) => drawBlades(tw.getValue() ?? 0),
  });

  const fenceTweens = [
    scene.tweens.add({
      targets: left,
      angle: { from: -8, to: 10 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }),
    scene.tweens.add({
      targets: right,
      angle: { from: 8, to: -10 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }),
  ];

  const fenceLabel = scene.add
    .text(fx0, fy0 + 36, 'фехтование', {
      color: '#c8d0e0',
      fontSize: '11px',
      fontStyle: 'bold',
      backgroundColor: '#00000088',
      padding: { x: 5, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  // Archery practice (day)
  const archer = makeGuard(scene, layout.archer.x, layout.archer.y, ['npc-town_guard-0'], 0.88, 0xd0d8e0);
  if (archer instanceof Phaser.GameObjects.Sprite) archer.setFlipX(false);
  const arrows = scene.add.graphics().setDepth(Depth.Ambient);
  let archeryOn = true;
  loopDecorCounter(scene, {
    from: 0,
    to: 1,
    duration: 1100,
    repeat: -1,
    onUpdate: (tw) => {
      arrows.clear();
      if (!archeryOn || !shifts[2]?.atPost) return;
      const t = tw.getValue() ?? 0;
      const ax0 = archer.x + 10;
      const ay0 = archer.y - 6;
      const target=layout.archeryTargets[t<0.5?0:1];
      const ax1=target.x;
      const ay1=target.y-18;
      const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const px = ax0 + (ax1 - ax0) * u;
      const py = ay0 + (ay1 - ay0) * u - Math.sin(u * Math.PI) * 12;
      arrows.lineStyle(2, 0xc8a878, 0.85);
      arrows.lineBetween(px - 6, py, px + 6, py - 1);
      arrows.fillStyle(0xd03030, 0.9);
      arrows.fillTriangle(px + 6, py - 1, px + 10, py - 3, px + 10, py + 1);
    },
  });
  const archLabel = scene.add
    .text(x + 175, y + 55, 'стрельба', {
      color: '#c8d0a0',
      fontSize: '10px',
      backgroundColor: '#00000077',
      padding: { x: 4, y: 1 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  // Day patrol around plaza
  const patrol = makeGuard(scene, layout.patrol[0].x, layout.patrol[0].y, ['npc-town_captain-0'], 0.92, 0xe0e8f0);
  const patrolPath = [...layout.patrol];
  let patrolActive = true;


  // Night watch with lantern (replaces day fencing visibility somewhat)
  const nightWatch = makeGuard(scene, layout.patrol[0].x, layout.patrol[0].y, ['npc-town_guard-0'], 0.92, 0xb0b8c8);
  const lamp = scene.add.circle(x - 26, y - 28, 5, 0xffc878, 1).setDepth(entityDepth(y) + 1);
  const glow = scene.add.circle(x - 26, y - 28, 32, 0xffaa55, 0.16).setDepth(Depth.Ambient);
  nightWatch.setVisible(false);
  lamp.setVisible(false);
  glow.setVisible(false);
  let nightOn = false;
  const nightPath = [...layout.patrol].reverse();
  const leftShift=bindDecorShift(scene,left,'garrison:fencer:left',layout.fencing[0],entrance,()=>fencingOn,0);
  const rightShift=bindDecorShift(scene,right,'garrison:fencer:right',layout.fencing[1],entrance,()=>fencingOn,1000);
  const archerShift=bindDecorShift(scene,archer,'garrison:archer',layout.archer,entrance,()=>archeryOn,2000);
  shifts.push(leftShift,rightShift,archerShift);
  const dayShift=bindDecorShift(scene,patrol,'garrison:day',layout.patrol[0],entrance,()=>patrolActive,3000);
  const nightShift=bindDecorShift(scene,nightWatch,'garrison:night',layout.patrol.at(-1)!,entrance,()=>nightOn,1000);
  bindDecorPatrol(scene,patrol,patrolPath,48,()=>patrolActive&&dayShift.atPost,undefined,'garrison:day');
  bindDecorPatrol(scene,nightWatch,nightPath,40,()=>nightOn&&nightShift.atPost,()=>{
    lamp.setPosition(nightWatch.x+14,nightWatch.y-8);lamp.setDepth(entityDepth(nightWatch.y)+1);glow.setPosition(lamp.x,lamp.y);
  },'garrison:night');
  const updateWatchLight=()=>{
    const visible=nightWatch.visible&&!nightShift.indoors;
    lamp.setVisible(visible);glow.setVisible(visible);
    lamp.setPosition(nightWatch.x+14,nightWatch.y-8);lamp.setDepth(entityDepth(nightWatch.y)+1);glow.setPosition(lamp.x,lamp.y);
    const exercising=fencingOn&&leftShift.atPost&&rightShift.atPost;
    for(const tween of fenceTweens){if(exercising)tween.resume();else tween.pause();}
    fenceLabel.setVisible(exercising);archLabel.setVisible(archeryOn&&archerShift.atPost);
  };
  scene.events.on('update',updateWatchLight);
  scene.events.once('shutdown',()=>scene.events.off('update',updateWatchLight));

  const districtLabel = scene.add
    .text(x, y - 130, 'гарнизон', {
      color: '#a09890',
      fontSize: '12px',
      fontStyle: 'bold',
      backgroundColor: '#00000077',
      padding: { x: 6, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  // Drill dust near sparring ring
  const dust = scene.add.graphics().setDepth(3);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2400,
    repeat: -1,
    onUpdate: (tw) => {
      const p = tw.getValue() ?? 0;
      dust.clear();
      if (!fencingOn || !shifts[0]?.atPost || !shifts[1]?.atPost) return;
      for (let i = 0; i < 5; i++) {
        const a = p + i;
        dust.fillStyle(0xd4c090, 0.1);
        dust.fillCircle(fx0 + Math.cos(a) * 18, fy0 + 8 + Math.sin(a * 1.4) * 10, 3);
      }
    },
  });

  dayNight(
    scene,
    () => {
      // Day: fencing, archery, patrol; hide night watch
      fencingOn = true;
      archeryOn = true;
      patrolActive = true;
      fenceLabel.setVisible(true);
      archLabel.setVisible(true);
      for (const s of sitters) s.body.setVisible(true);
      stewLabel.setVisible(true);
      for (const t of fenceTweens) t.resume();
      nightOn = false;
      lamp.setVisible(false);
      glow.setVisible(false);
    },
    () => {
      // Night: sitters stay for stew, fencing off, night watch on
      fencingOn = false;
      archeryOn = false;
      patrolActive = false;
      fenceLabel.setVisible(false);
      archLabel.setVisible(false);
      blades.clear();
      arrows.clear();
      for (const t of fenceTweens) t.pause();
      for (const s of sitters) s.body.setVisible(true);
      stewLabel.setVisible(true);
      if (!nightOn) {
        nightOn = true;
        lamp.setVisible(true);
        glow.setVisible(true);
      }
    },
  );


  // The garrison is a populated military district, with physical shift changes.
  const drillGround=scene.add.graphics().setDepth(2);
  drillGround.fillStyle(0x887b61,.18);drillGround.fillRect(1024,896,256,144);
  drillGround.lineStyle(1,0xc9b887,.35);
  for(const py of [928,992])drillGround.lineBetween(1032,py+10,1280,py+10);
  const soldiers=HAVEN_GARRISON_SOLDIERS.map((definition,index)=>{
    const soldier=makeGuard(scene,definition.post.x,definition.post.y,guardPrefs,index%4===0?.96:.9,
      definition.shift==='night'?0xb8c4d4:0xffffff,`garrison-soldier-${index}`);
    if(definition.shift==='night')soldier.setVisible(false);
    const id=`garrison:soldier:${index}`;
    const shift=bindDecorShift(scene,soldier,id,definition.post,entrance,
      ()=>definition.shift==='night'?nightOn:!nightOn,(index%8)*700);
    if(definition.role==='patrol'){
      const offset=index%layout.patrol.length;
      const route=[...layout.patrol.slice(offset),...layout.patrol.slice(0,offset)];
      bindDecorPatrol(scene,soldier,route,34+(index%3)*3,()=>shift.atPost&&(definition.shift==='night'?nightOn:!nightOn),undefined,id);
    }
    return {soldier,definition,shift,index};
  });
  const updateSoldierActivities=(time:number)=>{
    for(const {soldier,definition,shift,index} of soldiers){
      if(!(soldier instanceof Phaser.GameObjects.Sprite))continue;
      if(!shift.atPost){soldier.setScale(Math.abs(soldier.scaleX));continue;}
      if(definition.role==='patrol')continue;
      const prefix=String(soldier.frame.name).replace(/-(?:up-)?\d+$/,'');
      const drilling=definition.role==='drill'&&(time+index*170)%2000<650;
      const frame=`${prefix}-${drilling?4:0}`;
      if(soldier.texture.has(frame))soldier.setFrame(frame);
      soldier.setFlipX(definition.role==='drill'?index%4>=2:definition.post.x>928);
      soldier.setScale(Math.abs(soldier.scaleX),Math.abs(soldier.scaleX)*(definition.role==='rest'?.86:1));
    }
  };
  scene.events.on('update',updateSoldierActivities);
  scene.events.once('shutdown',()=>scene.events.off('update',updateSoldierActivities));

  void districtLabel;
}
