import { cityCrowd } from '../game/systems/city-crowd.js';
import { resolveNpcHomeEntrance } from './npc-home-entrance.js';
import { CityUpdateClock } from '../game/systems/city-update-clock.js';
import { CityStageMotion } from '../game/systems/city-stage-motion.js';
import { ActorVisualOffset } from '../game/systems/actor-visual-offset.js';
import { CityActorAnimation } from './city-actor-animation.js';
import Phaser from 'phaser';
import { Depth, entityDepth } from '../game/constants/depth.js';
import { placeWorldProp, resolvePropDepth } from './place-world-prop.js';
import { addPropFootprint, isInsidePropAabb, propCollisionRevision } from './prop-colliders.js';
import { buildNpcRoute } from './npc-pathing.js';
import { isTileBlockedAt } from './world-tiles.js';
import { COMBAT_ATLAS_KEY, registerCombatSprites, registerCitizenSprite } from './sprite-factory.js';
import { setupSpriteDisplay } from './sprite-loader.js';
import { attachEntityShadow, syncEntityShadow } from './visual-polish.js';
import { HAVEN_STAGE_STORIES } from './haven-stage-stories.js';
import { playStageApplause } from '../stage-audio.js';
import { appendChatSystem } from '../chat-ui.js';
import { PLAYER_XY_KEY } from './haven-citizens.js';
import { getHavenSchedule, subscribeHavenSchedule } from '../world-clock.js';
import { loopDecorCounter } from './decor-fx.js';
import { HAVEN_STAGE_ACTOR_COUNT, HAVEN_STAGE_SEAT_OFFSETS, havenStageSeat, havenActorLane, stageHomeWorld } from '@empery/shared';

export type { HavenStageStory } from './haven-stage-stories.js';
export { HAVEN_STAGE_STORIES } from './haven-stage-stories.js';

function pickFrame(scene: Phaser.Scene, preferred: string[]): string | null {
  if (!scene.textures.exists(COMBAT_ATLAS_KEY)) return null;
  const atlas = scene.textures.get(COMBAT_ATLAS_KEY);
  for (const f of preferred) {
    if (atlas.has(f)) return f;
  }
  const names = atlas.getFrameNames();
  return names.find((n) => n.startsWith('npc-') && n.endsWith('-0')) ?? names[0] ?? null;
}

/** Audience sits south of the stage — use `-up-0` so they face the bard. */
function pickAudienceFrame(scene: Phaser.Scene, preferred: string[]): string | null {
  const down = pickFrame(scene, preferred);
  if (!down) return null;
  const up = down.replace(/-(\d+)$/, '-up-$1');
  if (scene.textures.exists(COMBAT_ATLAS_KEY) && scene.textures.get(COMBAT_ATLAS_KEY).has(up)) {
    return up;
  }
  return down;
}

function holdForLine(line: string): number {
  return Math.min(5600, 2200 + line.length * 48);
}

interface StageRosterEntry {
  id: string;
  target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  seatX: number;
  seatY: number;
  homeX: number;
  homeY: number;
  asleep: boolean;
  speed: number;
  /** Seated toward stage (north) — keep `-up` frame while seated. */
  facesStage?: boolean;
  downFrame?: string;
  upFrame?: string;
  bobTween?: Phaser.Tweens.Tween;
  applauseTween?: Phaser.Tweens.Tween;
  visualOffset?: ActorVisualOffset;
  walkAnimation?: CityActorAnimation;
}

function stopActorBob(entry: StageRosterEntry): void {
  entry.bobTween?.remove();
  entry.bobTween = undefined;
  entry.applauseTween?.remove();
  entry.applauseTween = undefined;
  entry.visualOffset?.clear();
}

function ensureActorBob(
  scene: Phaser.Scene,
  entry: StageRosterEntry,
  yAmp: number,
  delay = 0,
): void {
  if (entry.bobTween?.isPlaying()) return;
  entry.target.setPosition(entry.seatX, entry.seatY);
  if (entry.target instanceof Phaser.GameObjects.Sprite) {
    const idleFrame = entry.facesStage ? entry.upFrame : entry.downFrame;
    if (idleFrame && entry.target.texture.has(idleFrame)) {
      entry.target.setFrame(idleFrame);
    }
    entry.target.setFlipX(false);
  }
  addActorBob(scene, entry, yAmp, delay);
}

function addActorBob(
  scene: Phaser.Scene,
  entry: StageRosterEntry,
  yAmp: number,
  delay = 0,
): void {
  stopActorBob(entry);
  entry.visualOffset ??= new ActorVisualOffset(entry.target);
  const bob={offset:0};
  entry.bobTween = scene.tweens.add({
    targets: bob,
    offset: yAmp,
    duration: 780 + delay,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    delay,
    onUpdate:()=>entry.visualOffset!.set('bob',0,-bob.offset),
  });
}

/**
 * Grand open-air amphitheatre + bard who cycles short lore stories line by line.
 * Speech uses Phaser timed events (not async/await) so it survives scene boot.
 */
export function placeHavenStage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size = 300,
): void {
  try {
    registerCombatSprites(scene, 'human');
  } catch {
    /* atlas may already exist */
  }

  // ——— Ground: amphitheatre bowl south of the platform (keep north clear for plaza/well) ———
  const ground = scene.add.graphics().setDepth(2);
  ground.fillStyle(0x5a5040, 0.2);
  ground.fillEllipse(x, y + size * 0.28, size * 1.15, size * 0.58);
  ground.fillStyle(0x7a6c58, 0.14);
  ground.fillEllipse(x, y + size * 0.26, size * 0.95, size * 0.45);
  ground.fillStyle(0x9a8c78, 0.1);
  ground.fillEllipse(x, y + size * 0.24, size * 0.72, size * 0.32);
  // Red carpet aisle (south only)
  ground.fillStyle(0x8a2030, 0.26);
  ground.fillRect(x - size * 0.055, y + size * 0.12, size * 0.11, size * 0.36);
  ground.fillStyle(0xb03040, 0.16);
  ground.fillRect(x - size * 0.035, y + size * 0.14, size * 0.07, size * 0.32);
  // Stone step arcs (south bowl)
  ground.lineStyle(3, 0x4a4030, 0.32);
  for (let r = 0; r < 3; r++) {
    ground.strokeEllipse(x, y + size * 0.22, size * (0.5 + r * 0.16), size * (0.26 + r * 0.09));
  }

  const img = placeWorldProp(scene, 'prop_open_stage', x, y, size);
  if (!img) {
    const g = scene.add.graphics().setDepth(resolvePropDepth(scene, 'prop_open_stage', y, size));
    g.fillStyle(0x6a5848, 0.95);
    g.fillRoundedRect(x - size * 0.42, y - size * 0.28, size * 0.84, size * 0.48, 12);
    g.fillStyle(0x8a2030, 0.85);
    g.fillRoundedRect(x - size * 0.38, y - size * 0.42, size * 0.76, size * 0.16, 8);
    g.fillStyle(0xd4a050, 0.5);
    g.fillRect(x - size * 0.4, y + size * 0.14, size * 0.8, 8);
    addPropFootprint(scene, 'prop_open_stage', x, y, size);
  }

  // Side wings: banners + lamps + benches + side colonnade feel
  const wingProps: Array<readonly [string, number, number, number]> = [
    ['prop_banner_pole', x - size * 0.52, y - size * 0.08, 78],
    ['prop_banner_pole', x + size * 0.52, y - size * 0.08, 78],
    ['prop_banner_pole', x - size * 0.42, y - size * 0.22, 70],
    ['prop_banner_pole', x + size * 0.42, y - size * 0.22, 70],
    ['prop_street_lamp', x - size * 0.58, y + size * 0.14, 68],
    ['prop_street_lamp', x + size * 0.58, y + size * 0.14, 68],
    ['prop_bench', x - size * 0.42, y + size * 0.38, 60],
    ['prop_bench', x + size * 0.42, y + size * 0.38, 60],
    ['prop_bench', x - size * 0.22, y + size * 0.48, 58],
    ['prop_bench', x + size * 0.22, y + size * 0.48, 58],
    ['prop_bench', x - size * 0.08, y + size * 0.54, 56],
    ['prop_bench', x + size * 0.08, y + size * 0.54, 56],
    ['prop_planter', x - size * 0.56, y + size * 0.3, 52],
    ['prop_planter', x + size * 0.56, y + size * 0.3, 52],
    ['prop_rose_arch', x - size * 0.62, y + size * 0.02, 95],
    ['prop_rose_arch', x + size * 0.62, y + size * 0.02, 95],
  ];
  for (const [id, px, py, sz] of wingProps) {
    placeWorldProp(scene, id, px, py, sz);
  }

  // Soft curtain glow behind the stage
  const curtains = scene.add.graphics().setDepth(Depth.Ambient);
  const drawCurtains = (phase: number) => {
    curtains.clear();
    const pulse = 0.12 + 0.06 * Math.sin(phase);
    curtains.fillStyle(0xa01828, pulse);
    curtains.fillEllipse(x - size * 0.22, y - size * 0.32, size * 0.2, size * 0.28);
    curtains.fillEllipse(x + size * 0.22, y - size * 0.32, size * 0.2, size * 0.28);
    curtains.fillStyle(0xd4a050, pulse * 0.7);
    curtains.fillCircle(x, y - size * 0.36, 6 + Math.sin(phase * 2) * 1.5);
  };
  drawCurtains(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 3200,
    repeat: -1,
    onUpdate: (tw) => drawCurtains(tw.getValue() ?? 0),
  });

  // Footlights along the apron
  const lights = scene.add.graphics().setDepth(Depth.Ambient);
  const drawLights = (phase: number) => {
    lights.clear();
    for (let i = -5; i <= 5; i++) {
      const lx = x + i * (size * 0.075);
      const ly = y + size * 0.16;
      const flicker = 0.45 + 0.55 * Math.sin(phase * 3 + i * 0.7);
      lights.fillStyle(0xffaa44, 0.22 * flicker);
      lights.fillCircle(lx, ly, 6 + flicker * 2.5);
      lights.fillStyle(0xffee88, 0.4 * flicker);
      lights.fillCircle(lx, ly - 1, 2.5);
    }
  };
  drawLights(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2000,
    repeat: -1,
    onUpdate: (tw) => drawLights(tw.getValue() ?? 0),
  });

  const {x:ax,y:ay} = havenStageSeat(0, {x,y,size});
  let actor: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  const roster: StageRosterEntry[] = [];

  const frame = pickFrame(scene, [
    'npc-town_scribe-0',
    'npc-town_teacher-0',
    'npc-town_innkeeper-0',
    'npc-town_radio-0',
  ]);
  const individualBard=frame?registerCitizenSprite(scene,'stage-bard',frame):null;
  if (frame && individualBard) {
    const spr = scene.add.sprite(ax, ay, individualBard.texture, individualBard.frame).setDepth(entityDepth(ay));
    setupSpriteDisplay(spr, 1.15);
    attachEntityShadow(scene, spr, 26, 11, 0.28);
    actor = spr;
  } else {
    const body = scene.add.rectangle(ax, ay, 30, 38, 0xc8a878, 1).setDepth(entityDepth(ay));
    scene.add.circle(ax, ay - 18, 10, 0xe8d0b0, 1).setDepth(entityDepth(ay) + 0.01);
    actor = body;
  }

  const bardEntry: StageRosterEntry = {
    id: 'stage_bard',
    target: actor,
    seatX: ax,
    seatY: ay,
    homeX: x - size * 0.15,
    homeY: y + size * 0.42,
    asleep: false,
    speed: 48,
    downFrame: individualBard?.frame ?? frame ?? undefined,
  };
  roster.push(bardEntry);

  const bardSway = scene.tweens.add({
    targets: actor,
    angle: { from: -5, to: 5 },
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  addActorBob(scene, bardEntry, 5);

  const bardLabel = scene.add
    .text(ax, ay + 24, 'Бард Кай', {
      color: '#e8d0a0',
      fontSize: '12px',
      fontStyle: 'bold',
      backgroundColor: '#00000099',
      padding: { x: 6, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(Depth.FloatText);

  // Audience on the amphitheatre steps
  if (scene.textures.exists(COMBAT_ATLAS_KEY)) {
    const seats = HAVEN_STAGE_SEAT_OFFSETS.slice(0, Math.max(0, HAVEN_STAGE_ACTOR_COUNT - 1));
    const prefs = [
      'npc-town_merchant-0',
      'npc-town_butcher-0',
      'npc-town_fisher-0',
      'npc-town_guard-0',
      'npc-town_healer-0',
      'npc-town_innkeeper-0',
      'npc-town_brewer-0',
    ];
    for (let i = 0; i < seats.length; i++) {
      const {x:seatX,y:seatY}=havenStageSeat(i+1,{x,y,size});
      const f = pickAudienceFrame(scene, [prefs[i % prefs.length]!]);
      if (!f) continue;
      const individual=registerCitizenSprite(scene,`stage-audience-${i}`,f);
      const downFrame=individual.frame;
      const upFrame=`${individual.prefix}-up-0`;
      const s = scene.add
        .sprite(seatX, seatY, individual.texture, upFrame)
        .setDepth(entityDepth(seatY));
      setupSpriteDisplay(s, 0.85);
      attachEntityShadow(scene, s, 18, 7, 0.2);

      const entry: StageRosterEntry = {
        id: `stage_audience_${i}`,
        target: s,
        seatX,
        seatY,
        homeX: seatX,
        homeY: seatY,
        asleep: false,
        speed: 46 + (i % 3) * 4,
        facesStage: true,
        downFrame,
        upFrame,
      };
      roster.push(entry);
      addActorBob(scene, entry, 2, i * 80);
    }
  }

  const titleText = scene.add
    .text(x, ay - 72, '', {
      color: '#f0d090',
      fontSize: '14px',
      fontStyle: 'bold',
      backgroundColor: '#201810ee',
      padding: { x: 10, y: 4 },
    })
    .setOrigin(0.5)
    .setDepth(Depth.FloatText)
    .setVisible(false);

  const lineText = scene.add
    .text(x, ay - 48, '', {
      color: '#fff4dc',
      fontSize: '13px',
      fontStyle: 'bold',
      backgroundColor: '#000000dd',
      padding: { x: 10, y: 4 },
      wordWrap: { width: 360 },
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(Depth.FloatText)
    .setVisible(false);

  let storyIdx = Math.floor(Math.random() * HAVEN_STAGE_STORIES.length);
  let lineIdx = -1; // -1 = title beat, 0..n-1 = lines, then applause
  let stopped = false;
  let performancePaused = true;
  const timers = new Set<Phaser.Time.TimerEvent>();

  const pickNextStory = () => {
    const n = HAVEN_STAGE_STORIES.length;
    if (n <= 1) return;
    let next = Math.floor(Math.random() * n);
    // Avoid repeating the same tale back-to-back.
    while (next === storyIdx) next = Math.floor(Math.random() * n);
    storyIdx = next;
  };

  const clearTimers = () => {
    for (const t of timers) t.remove(false);
    timers.clear();
  };

  const schedule = (ms: number, fn: () => void) => {
    const ev = scene.time.delayedCall(ms, () => {
      timers.delete(ev);
      if (stopped) return;
      fn();
    });
    timers.add(ev);
  };

  const pausePerformance = () => {
    if (performancePaused) return;
    performancePaused = true;
    clearTimers();
    titleText.setVisible(false);
    lineText.setVisible(false);
    bardLabel.setVisible(false);
    for (const entry of roster) stopActorBob(entry);
  };

  const resumePerformance = () => {
    if (!performancePaused || stopped) return;
    performancePaused = false;
    bardLabel.setVisible(true);
    lineIdx = -1;
    schedule(600, advance);
  };

  const applyStageSleepPose = (entry: StageRosterEntry) => {
    stopActorBob(entry);
    entry.target.setVisible(false);
    entry.target.setAlpha(0);
    entry.target.setPosition(entry.homeX, entry.homeY);
    if (entry.target instanceof Phaser.GameObjects.Sprite) {
      entry.target.clearTint();
    }
  };

  const showStageActor = (entry: StageRosterEntry) => {
    entry.target.setVisible(true);
    entry.target.setAlpha(1);
    if (entry.target instanceof Phaser.GameObjects.Sprite) entry.target.clearTint();
  };

  const canRunPerformance = (): boolean => {
    const sched = getHavenSchedule();
    if (!sched || sched.restActive || sched.performancePaused) return false;
    const bardSched = sched.stage.find((a) => a.id === 'stage_bard');
    if (!bardSched || !bardSched.atSeat || bardSched.asleep) return false;
    const bard = roster[0];
    if (!bard || !bard.target.visible || bard.target.alpha < 0.6) return false;
    if (Math.hypot(bard.target.x - bard.seatX, bard.target.y - bard.seatY) > 18) return false;
    for (const entry of roster) {
      const actorSched = sched.stage.find((a) => a.id === entry.id);
      if (!actorSched || !actorSched.atSeat || actorSched.asleep || !motions.get(entry)?.atSeat || !entry.target.visible) return false;
    }
    return true;
  };

  const motions = new Map<StageRosterEntry, CityStageMotion>();
  const crowd = cityCrowd(scene);
  const releaseCrowd: (()=>void)[] = [];
  for (const entry of roster) {
    const homeIndex = entry.id === 'stage_bard' ? 0 : Number(entry.id.slice('stage_audience_'.length)) + 1;
    const home = stageHomeWorld(homeIndex);
    if (entry.target instanceof Phaser.GameObjects.Sprite) {
      const prefix = String(entry.target.frame.name).replace(/-(?:up-)?\d+$/, '');
      entry.walkAnimation = new CityActorAnimation(prefix);
    }
    entry.homeX = home.x;
    entry.homeY = home.y;
    const crowdId = `theatre:${entry.id}`;
    releaseCrowd.push(crowd.register(crowdId,()=>({x:entry.target.x,y:entry.target.y,active:entry.target.active&&entry.target.visible&&!entry.asleep})));
    const walkable = (point: {x:number;y:number})=>!isTileBlockedAt(scene,point.x,point.y)&&!isInsidePropAabb(scene,point.x,point.y,13);
    motions.set(entry, new CityStageMotion({
      position: () => ({ x: entry.target.x, y: entry.target.y }),
      move: point => {
        entry.target.setPosition(point.x, point.y);
      },
      route: (from, to) => buildNpcRoute(scene, from.x, from.y, to.x, to.y, havenActorLane(entry.id)),
      revision: () => propCollisionRevision(scene),
      walkable,
      constrainStep: (from,to)=>crowd.step(crowdId,from,to,scene.game.loop.frame,walkable),
    }, { x: entry.seatX, y: entry.seatY }, () => resolveNpcHomeEntrance(scene, home.x, home.y)));
  }
  let seeded = false;
  const applyScheduleSnap = () => {
    const sched = getHavenSchedule();
    if (!sched) return;
    // Bootstrap only: live clock messages must not reposition seated or commuting actors.
    if (!seeded) {
      for (const entry of roster) {
        const actorSched = sched.stage.find(a => a.id === entry.id);
        if (!actorSched) continue;
        stopActorBob(entry);
        motions.get(entry)!.seed(actorSched, sched.restActive);
        entry.asleep = motions.get(entry)!.asleep;
        if (entry.asleep) applyStageSleepPose(entry);
        else showStageActor(entry);
      }
      seeded = true;
    }
    if (sched.restActive || sched.performancePaused) pausePerformance();
  };
  applyScheduleSnap();
  const unsubSchedule = subscribeHavenSchedule(applyScheduleSnap);

  const updateClock = new CityUpdateClock();
  const onScheduleUpdate = (_time: number, delta: number) => {
    if (stopped) return;
    const elapsed = updateClock.take(roster, delta, 32);
    if (elapsed == null) return;
    const sched = getHavenSchedule();
    if (!sched) return;
    const stageById = new Map(sched.stage.map(actor => [actor.id, actor]));
    for (let i = 0; i < roster.length; i++) {
      const entry = roster[i]!, actorSched = stageById.get(entry.id);
      if (!actorSched) continue;
      const motion = motions.get(entry)!;
      const beforeX = entry.target.x, beforeY = entry.target.y;
      motion.update(actorSched, sched.restActive, Math.min(elapsed, 250), entry.speed);
      entry.asleep = motion.asleep;
      if (entry.asleep) applyStageSleepPose(entry);
      else {
        showStageActor(entry);
        if (motion.atSeat) ensureActorBob(scene, entry, i === 0 ? 5 : 2, i * 80);
        else {
          stopActorBob(entry);
          if (entry.target instanceof Phaser.GameObjects.Sprite) {
            entry.walkAnimation?.update(entry.target, entry.target.x - beforeX, entry.target.y - beforeY, elapsed);
          }
        }
        if (i === 0) {
          if (motion.atSeat) bardSway.resume();
          else { bardSway.pause(); entry.target.setAngle(0); }
        }
        entry.target.setDepth(entityDepth(entry.target.y));
        if (entry.target instanceof Phaser.GameObjects.Sprite) syncEntityShadow(entry.target);
      }
    }
    if (!canRunPerformance()) pausePerformance();
    else resumePerformance();
    bardLabel.setVisible(!performancePaused);
  };

  scene.events.on('update', onScheduleUpdate);

  const applause = () => {
    if (performancePaused) return;
    const getPlayer = scene.data.get(PLAYER_XY_KEY) as
      | (() => { x: number; y: number } | null)
      | undefined;
    const player = getPlayer?.() ?? null;
    if (player) {
      playStageApplause(1700, {
        sourceX: x,
        sourceY: y,
        listenerX: player.x,
        listenerY: player.y,
        innerRadius: 220,
        outerRadius: 580,
      });

      const dist = Math.hypot(player.x - x, player.y - y);
      if (dist <= 280) {
        const noteBubble = scene.add
          .text(player.x, player.y - 48, '♪ Вдохновение амфитеатра! ♫', {
            color: '#ffe080',
            fontSize: '13px',
            fontStyle: 'bold',
            backgroundColor: '#000000aa',
            padding: { x: 6, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(Depth.FloatText);
        scene.tweens.add({
          targets: noteBubble,
          y: noteBubble.y - 28,
          alpha: 0,
          duration: 2200,
          onComplete: () => noteBubble.destroy(),
        });
        appendChatSystem(
          '🎭 Амфитеатр взрывается аплодисментами! Баллада барда Кая наполняет вас силами.',
        );
      }
    }
    const cries = ['Браво!', 'Ещё!', 'Слава Гавани!', 'Ух!', 'Правда!', 'Бис!'];
    for (let i = 1; i < roster.length; i++) {
      const entry=roster[i]!,a = entry.target as Phaser.GameObjects.Sprite;
      const jump={offset:0};
      entry.visualOffset ??= new ActorVisualOffset(entry.target);
      entry.applauseTween?.remove();
      entry.applauseTween=scene.tweens.add({
        targets: jump,
        offset: 6,
        duration: 180,
        yoyo: true,
        repeat: 2,
        delay: i * 40,
        onUpdate:()=>entry.visualOffset!.set('applause',0,-jump.offset),
        onComplete:()=>{entry.visualOffset!.set('applause',0,0);entry.applauseTween=undefined;},
      });
      if (i % 2 === 0) {
        const bubble = scene.add
          .text(a.x, a.y - 28, cries[i % cries.length]!, {
            color: '#ffe8c0',
            fontSize: '11px',
            fontStyle: 'bold',
            backgroundColor: '#000000aa',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(Depth.FloatText);
        scene.tweens.add({
          targets: bubble,
          y: bubble.y - 14,
          alpha: 0,
          duration: 1400,
          onComplete: () => bubble.destroy(),
        });
      }
    }
  };

  const advance = () => {
    if (stopped || performancePaused) return;
    if (!canRunPerformance()) {
      pausePerformance();
      return;
    }
    const story = HAVEN_STAGE_STORIES[storyIdx]!;

    if (lineIdx < 0) {
      titleText.setText(`«${story.title}»`);
      titleText.setVisible(true);
      lineText.setText('…');
      lineText.setVisible(true);
      lineText.setAlpha(1);
      lineIdx = 0;
      schedule(900, advance);
      return;
    }

    if (lineIdx < story.lines.length) {
      const line = story.lines[lineIdx]!;
      lineText.setText(line);
      lineText.setVisible(true);
      lineText.setAlpha(1);
      lineText.setY(ay - 48);
      scene.tweens.add({
        targets: lineText,
        y: ay - 56,
        duration: 250,
        ease: 'Sine.easeOut',
      });
      scene.tweens.add({
        targets: actor,
        scaleX: (actor.scaleX || 1) * 1.06,
        scaleY: (actor.scaleY || 1) * 1.06,
        duration: 140,
        yoyo: true,
      });
      lineIdx += 1;
      schedule(holdForLine(line), advance);
      return;
    }

    // Applause / bow beat
    titleText.setVisible(false);
    lineText.setText('— аплодисменты —');
    lineText.setVisible(true);
    applause();
    scene.tweens.add({
      targets: actor,
      angle: 14,
      duration: 350,
      yoyo: true,
      hold: 300,
    });
    lineIdx = -1;
    pickNextStory();
    schedule(2000, () => {
      lineText.setVisible(false);
      schedule(800, advance);
    });
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    stopped = true;
    for(const release of releaseCrowd)release();
    performancePaused = true;
    scene.events.off('update', onScheduleUpdate);
    unsubSchedule();
    clearTimers();
    titleText.destroy();
    lineText.destroy();
    bardLabel.destroy();
    for (const entry of roster) {
      stopActorBob(entry);
    }
  });

  // Start only from authoritative schedule when bard is actually on stage.
}
