import { resolveNpcHomeEntrance } from '../../sprites/npc-home-entrance.js';
import { resolveNpcAnchor } from '../../sprites/npc-anchor.js';
import { CityRouteFollower } from './city-route-follower.js';
import { cityCrowd } from './city-crowd.js';
import { walkCadence } from '../../sprites/walk-cadence.js';
import type Phaser from 'phaser';
import {
  havenActorLane,
  pointAlongWorldPath,
  havenScheduleEntryById,
  type HavenNpcScheduleEntry,
  type HavenScheduleSnapshot,
  type NpcScheduleMode,
} from '@empery/shared';
import { entityDepth, syncEntityShadow } from '../../sprites/visual-polish.js';
import { npcIdleAnimKey, npcWalkAnimKey, npcSpriteFrame } from '../../sprites/sprite-factory.js';
import { npcWorldDef } from '../../sprites/npc-catalog.js';
import { buildNpcRoute, clearNpcRouteCache } from '../../sprites/npc-pathing.js';
import { isInsidePropAabb, nudgePointFromPropColliders, propCollisionRevision } from '../../sprites/prop-colliders.js';
import { isTileBlockedAt } from '../../sprites/world-tiles.js';

export interface NpcActorState {
  releaseCrowd?: () => void;
  walkNorth?: boolean;
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  /** Daytime post / shop anchor. */
  homeX: number;
  homeY: number;
  sleepHomeX: number;
  sleepHomeY: number;
  wanderRadius: number;
  dayWanderRadius: number;
  wanderSpeed: number;
  target: { x: number; y: number } | null;
  pauseMs: number;
  wait: number;
  moving: boolean;
  scheduleMode: NpcScheduleMode;
  /** Resting visible at sleep home. */
  asleep: boolean;
  baseScale: number;
  /** Server-driven schedule when in empery_haven. */
  serverDriven: boolean;
  motion: CityRouteFollower;
  lane: -1 | 1;
  scheduleKey: string;
  homeTransition: 'none' | 'entering' | 'exiting';
  homeProgress: number;
  homeStart: { x: number; y: number };
  /** Ambient speech cooldown (ms). */
  barkCd?: number;
  /** Active speech bubble. */
  bubble?: Phaser.GameObjects.Text;
}

export const INTERACTIVE_NPC_BARKS: Record<string, string[]> = {
  town_blacksmith: [
    'Металл любит твёрдую руку...',
    'Закалка стали не терпит суеты.',
    'Уголь жаркий — лезвие будет крепким!',
  ],
  town_guard: [
    'Ворота под надзором. Закон в Гавани един для всех.',
    'Держи клинок в ножнах, путник.',
    'В Гавани всё спокойно.',
  ],
  town_captain: [
    'Дисциплина — основа порядка.',
    'Дозоры расставлены, город под надёжной защитой.',
  ],
  town_innkeeper: [
    'У очага всегда найдётся тёплая кружка и сытный суп.',
    'Свежий эль прямо из бочонка!',
    'Усталый путник — садись ближе к огню.',
  ],
  town_merchant: [
    'Лучшие товары со всего материка!',
    'Зелья, свитки, пряности — подходи, выбирай!',
  ],
  town_healer: [
    'Целебные травы лучше собирать до полудня.',
    'Каждую рану можно исцелить, если вовремя обратиться.',
  ],
  town_fisher: [
    'Море сегодня спокойное, треска пошла к отмели.',
    'Свежий улов долго не лежит — разбирают вмиг.',
  ],
  town_priest: [
    'Мир и благословение входящему под эти своды.',
    'Свет укажет путь во тьме.',
  ],
  town_stable: [
    'Лошади накормлены, подковы проверены.',
    'Славный скакун — лучший друг в дальней дороге.',
  ],
  town_radio: [
    'Эфир чистый, помех на волне нет.',
    'Сигнал Штаба принимаем стабильно.',
  ],
};

export function destroyNpcActor(actor: NpcActorState): void {
  actor.releaseCrowd?.();
  if (actor.bubble?.active) {
    actor.sprite.scene?.tweens?.killTweensOf(actor.bubble);
    actor.bubble.destroy();
    actor.bubble = undefined;
  }
}

function showNpcBark(actor: NpcActorState, text: string): void {
  const scene = actor.sprite.scene;
  if (!scene?.tweens) return;
  if (actor.bubble?.active) {
    scene.tweens.killTweensOf(actor.bubble);
    actor.bubble.destroy();
  }
  actor.bubble = undefined;
  const bubble = scene.add
    .text(actor.sprite.x, actor.sprite.y - 38, text, {
      color: '#fff0db',
      fontSize: '11px',
      backgroundColor: '#000000a0',
      padding: { x: 5, y: 2 },
    })
    .setOrigin(0.5)
    .setDepth(actor.sprite.depth + 2);
  actor.bubble = bubble;
  scene.tweens.add({
    targets: bubble,
    alpha: 0,
    duration: 2400,
    ease: 'Sine.easeIn',
    onComplete: () => {
      bubble.destroy();
      if (actor.bubble === bubble) actor.bubble = undefined;
    },
  });
}

/** Repath only when live sample drifted this far from route end (patrol). */
const REPATH_SAMPLE_PX = 72;

function clearRoute(actor: NpcActorState): void {
  actor.motion.clear();
  actor.moving = false;
}

function beginRoute(actor: NpcActorState, toX: number, toY: number, toleratePx = 0): void {
  actor.motion.setGoal({ x: toX, y: toY }, toleratePx);
}

function randInRadius(homeX: number, homeY: number, radius: number): { x: number; y: number } {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return { x: homeX + Math.cos(a) * r, y: homeY + Math.sin(a) * r };
}

function playAnim(sprite: Phaser.GameObjects.Sprite, key: string): void {
  if (!sprite.anims || !sprite.scene.anims.exists(key)) return;
  if (key.includes('-idle')) sprite.anims.timeScale=1;
  if (sprite.anims.isPlaying && sprite.anims.currentAnim?.key === key) return;
  sprite.anims.play(key, true);
}

function hideNpcIndoors(actor: NpcActorState): void {
  actor.asleep = true;
  actor.homeTransition = 'none';
  if (actor.bubble?.active) {
    actor.sprite.scene?.tweens?.killTweensOf(actor.bubble);
    actor.bubble.destroy();
    actor.bubble = undefined;
  }
  const spr = actor.sprite;
  spr.setVisible(false);
  spr.setAlpha(0);
  spr.clearTint();
  spr.setScale(actor.baseScale);
  spr.setPosition(actor.sleepHomeX, actor.sleepHomeY);
  clearRoute(actor);
}

function showNpcOutdoors(actor: NpcActorState): void {
  const spr = actor.sprite;
  if (!spr.visible || spr.alpha < 0.98) {
    spr.setVisible(true);
    spr.setAlpha(1);
    spr.clearTint();
    spr.setScale(actor.baseScale);
  }
}

function applyEntryVisuals(actor: NpcActorState, entry: HavenNpcScheduleEntry): void {
  actor.scheduleMode = entry.mode;
  actor.asleep = entry.asleep;
  if (entry.asleep || entry.phase === 'at_home') {
    hideNpcIndoors(actor);
  } else {
    showNpcOutdoors(actor);
  }
}

function startNpcHomeTransition(actor: NpcActorState, direction: 'entering' | 'exiting'): boolean {
  if (!resolveNpcHomeEntrance(actor.sprite.scene, actor.sleepHomeX, actor.sleepHomeY)) return false;
  clearRoute(actor);
  actor.homeTransition = direction;
  actor.homeProgress = 0;
  actor.homeStart = { x: actor.sprite.x, y: actor.sprite.y };
  actor.asleep = false;
  showNpcOutdoors(actor);
  return true;
}

function tickNpcHomeTransition(actor: NpcActorState, dt: number): void {
  const door = resolveNpcHomeEntrance(actor.sprite.scene, actor.sleepHomeX, actor.sleepHomeY);
  if (!door) return;
  actor.homeProgress = Math.min(1, actor.homeProgress + dt * 1000 / 460);
  const t = actor.homeProgress, entering = actor.homeTransition === 'entering';
  const from = entering ? actor.homeStart : { x: actor.sleepHomeX, y: actor.sleepHomeY };
  const to = entering ? { x: actor.sleepHomeX, y: actor.sleepHomeY } : door;
  actor.sprite.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  actor.sprite.setAlpha(entering ? 1 - t : t);
  actor.sprite.setDepth(entityDepth(actor.sprite.y));
  syncEntityShadow(actor.sprite);
  if (t === 1) {
    actor.homeTransition = 'none';
    if (entering) hideNpcIndoors(actor);
  }
}

function followNpcHome(actor: NpcActorState, dt: number): boolean {
  if (actor.asleep) return true;
  if (actor.homeTransition === 'entering') {
    tickNpcHomeTransition(actor, dt);
    return true;
  }
  actor.homeTransition = 'none';
  showNpcOutdoors(actor);
  const door = resolveNpcHomeEntrance(actor.sprite.scene, actor.sleepHomeX, actor.sleepHomeY);
  if (!door) { actor.moving = false; return true; }
  if (Math.hypot(actor.sprite.x - door.x, actor.sprite.y - door.y) <= 16) {
    clearRoute(actor);
    startNpcHomeTransition(actor, 'entering');
    playAnim(actor.sprite, npcIdleAnimKey(actor.id));
    return true;
  }
  beginRoute(actor, door.x, door.y);
  walkRoute(actor, dt, Math.max(36, actor.wanderSpeed * 1.45));
  return true;
}

function orientNpcTowardPlayer(spr: Phaser.GameObjects.Sprite): void {
  const getPlayer = spr.scene.data.get('getPlayerWorldXY') as
    | (() => { x: number; y: number } | null)
    | undefined;
  const player = getPlayer?.() ?? null;
  if (player) {
    spr.setFlipX(player.x < spr.x);
  }
}

function pickSafeWanderTarget(actor: NpcActorState): { x: number; y: number } {
  const scene = actor.sprite.scene;
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = randInRadius(actor.homeX, actor.homeY, actor.wanderRadius);
    const safe = nudgePointFromPropColliders(scene, raw.x, raw.y, 16);
    if (!isInsidePropAabb(scene, safe.x, safe.y, 14) && !isTileBlockedAt(scene, safe.x, safe.y)) {
      return safe;
    }
  }
  return { x: actor.homeX, y: actor.homeY };
}

function snapNpcToEntry(actor: NpcActorState, entry: HavenNpcScheduleEntry): void {
  applyEntryVisuals(actor, entry);
  actor.homeTransition = 'none';
  actor.scheduleKey = `${entry.phase}:${entry.asleep}`;
  clearRoute(actor);
  if (!entry.asleep && (entry.phase === 'walking_home' || entry.phase === 'walking_to_post') && typeof entry.walkT === 'number' && Number.isFinite(entry.walkT)) {
    const door=resolveNpcHomeEntrance(actor.sprite.scene,actor.sleepHomeX,actor.sleepHomeY);
    const post={x:actor.homeX,y:actor.homeY};
    if(door){
      const from=entry.phase==='walking_home'?post:door,to=entry.phase==='walking_home'?door:post;
      const route=buildNpcRoute(actor.sprite.scene,from.x,from.y,to.x,to.y,actor.lane);
      const pose=route.length?pointAlongWorldPath(route,entry.walkT):from;
      actor.sprite.setPosition(pose.x,pose.y);
    }
  } else {
    const pose=entry.asleep?entry:resolveNpcAnchor(actor.sprite.scene,entry.x,entry.y);
    if(pose)actor.sprite.setPosition(pose.x,pose.y);
  }
  if (entry.asleep || entry.phase === 'at_home') return;
  actor.sprite.setDepth(entityDepth(actor.sprite.y));
  syncEntityShadow(actor.sprite);
  if (entry.phase === 'at_post' && entry.mode === 'day') {
    actor.homeX = entry.x;
    actor.homeY = entry.y;
    actor.wanderRadius = actor.dayWanderRadius;
    actor.target = actor.wanderRadius > 0 ? randInRadius(entry.x, entry.y, actor.wanderRadius) : null;
    actor.wait = 400;
  } else {
    actor.wanderRadius = 0;
    actor.target = null;
  }
}

export function createNpcActor(
  id: string,
  sprite: Phaser.GameObjects.Sprite,
  homeX: number,
  homeY: number,
  opts?: {
    wanderRadius?: number;
    wanderSpeed?: number;
    sleepHomeX?: number;
    sleepHomeY?: number;
  },
): NpcActorState {
  const def = npcWorldDef(id);
  const wanderRadius = opts?.wanderRadius ?? def?.wanderRadius ?? 0;
  const wanderSpeed = opts?.wanderSpeed ?? def?.wanderSpeed ?? 22;
  const lane = havenActorLane(id);
  const crowd = cityCrowd(sprite.scene);
  const crowdId = `npc:${id}`;
  const releaseCrowd = crowd.register(crowdId,()=>({x:sprite.x,y:sprite.y,active:sprite.active&&sprite.visible&&sprite.alpha>0.5}));
  const walkable = (point: {x:number;y:number}) => !isInsidePropAabb(sprite.scene,point.x,point.y,13)&&!isTileBlockedAt(sprite.scene,point.x,point.y);
  const motion = new CityRouteFollower({
    position: () => ({ x: sprite.x, y: sprite.y }),
    move: point => { sprite.setFlipX(point.x < sprite.x); sprite.setPosition(point.x, point.y); },
    route: (from, to) => buildNpcRoute(sprite.scene, from.x, from.y, to.x, to.y, lane),
    revision: () => propCollisionRevision(sprite.scene),
    walkable,
    constrainStep: (from,to)=>crowd.step(crowdId,from,to,sprite.scene.game?.loop.frame??0,walkable),
  });
  playAnim(sprite, npcIdleAnimKey(id));
  return {
    releaseCrowd,
    id,
    sprite,
    homeX,
    homeY,
    sleepHomeX: opts?.sleepHomeX ?? homeX,
    sleepHomeY: opts?.sleepHomeY ?? homeY,
    wanderRadius,
    dayWanderRadius: wanderRadius,
    wanderSpeed,
    target: wanderRadius > 0 ? randInRadius(homeX, homeY, wanderRadius) : null,
    pauseMs: 900 + Math.floor(Math.random() * 1600),
    wait: Math.floor(Math.random() * 1200),
    moving: false,
    scheduleMode: 'day',
    asleep: false,
    baseScale: Math.abs(sprite.scaleX),
    serverDriven: false,
    motion,
    lane,
    scheduleKey: '',
    homeTransition: 'none',
    homeProgress: 0,
    homeStart: { x: homeX, y: homeY },
    barkCd: 5000 + Math.floor(Math.random() * 8000),
  };
}

/** Immediate snap when entering Haven or receiving bootstrap. */
export function snapNpcActorsToSchedule(
  actors: NpcActorState[],
  schedule: HavenScheduleSnapshot | null | undefined,
): void {
  if (!schedule) return;
  for (const actor of actors) {
    const entry = havenScheduleEntryById(schedule, actor.id);
    if (entry) snapNpcToEntry(actor, entry);
  }
}

/** Advance along current street route. Returns true when finished. */
function walkRoute(actor: NpcActorState, dt: number, speed: number): boolean {
  const beforeX = actor.sprite.x, beforeY = actor.sprite.y;
  const arrived = actor.motion.step(dt * 1000, speed);
  actor.moving = actor.motion.moving;
  const dx = actor.sprite.x - beforeX, dy = actor.sprite.y - beforeY;
  if (Math.hypot(dx, dy) > 0.01) actor.walkNorth = dy < -Math.abs(dx) * 0.5;
  const baseAnim = actor.moving ? npcWalkAnimKey(actor.id) : npcIdleAnimKey(actor.id);
  playAnim(actor.sprite, actor.walkNorth ? `${baseAnim}-up` : baseAnim);
  actor.sprite.anims.timeScale = actor.moving ? walkCadence(Math.hypot(dx,dy)/dt,36) : 1;
  actor.sprite.setDepth(entityDepth(actor.sprite.y));
  syncEntityShadow(actor.sprite);
  return arrived;
}

/**
 * Commute / patrol follow.
 * - walking_home / walking_to_post: route once to final destination (smooth, no sample chase).
 * - patrol: soft-follow live sample with generous repath tolerance + lane.
 */
function followCommuteOrPatrol(
  actor: NpcActorState,
  entry: HavenNpcScheduleEntry,
  dt: number,
): void {
  const spr = actor.sprite;
  const dx = entry.x - spr.x;
  const dy = entry.y - spr.y;
  const dist = Math.hypot(dx, dy);

  const commuting =
    entry.phase === 'walking_home' || entry.phase === 'walking_to_post';

  let destX = entry.x;
  let destY = entry.y;
  if (entry.phase === 'walking_home') {
    destX = actor.sleepHomeX;
    destY = actor.sleepHomeY + 30;
  } else if (entry.phase === 'walking_to_post') {
    destX = actor.homeX;
    destY = actor.homeY;
  }

  beginRoute(actor, destX, destY, commuting ? 0 : REPATH_SAMPLE_PX);

  const hurry = commuting ? Math.min(2.6, 1.45 + dist / 220) : 1.12;
  const speed = actor.wanderSpeed * hurry;
  const done = walkRoute(actor, dt, speed);
  if (done) {
    actor.moving = false;
    playAnim(spr, npcIdleAnimKey(actor.id));
  }
  spr.setDepth(entityDepth(spr.y));
  syncEntityShadow(spr);
}

/** Street-aware loiter around the shop / post — never cuts straight through blocks. */
function updateDayWander(actor: NpcActorState, dtMs: number): void {
  const dt = Math.min(0.25, Math.max(0,dtMs) / 1000);
  const spr = actor.sprite;

  if (actor.wanderRadius <= 0) {
    actor.moving = false;
    playAnim(spr, npcIdleAnimKey(actor.id));
    spr.setDepth(entityDepth(spr.y));
    syncEntityShadow(spr);
    return;
  }

  if (actor.wait > 0) {
    actor.wait -= dtMs;
    actor.moving = false;
    clearRoute(actor);
    playAnim(spr, npcIdleAnimKey(actor.id));
    spr.setDepth(entityDepth(spr.y));
    syncEntityShadow(spr);
    return;
  }

  if (!actor.target) {
    actor.target = pickSafeWanderTarget(actor);
    beginRoute(actor, actor.target.x, actor.target.y);
  }

  const distHome = Math.hypot(actor.target.x - actor.homeX, actor.target.y - actor.homeY);
  if (distHome > actor.wanderRadius + 8) {
    actor.target = pickSafeWanderTarget(actor);
    beginRoute(actor, actor.target.x, actor.target.y);
  }

  const tx = actor.target.x;
  const ty = actor.target.y;
  beginRoute(actor, actor.target.x, actor.target.y);
  const finished = walkRoute(actor, dt, actor.wanderSpeed);
  if (finished || Math.hypot(spr.x - tx, spr.y - ty) < 5 || actor.motion.failures >= 3) {
    actor.target = null;
    actor.wait = actor.pauseMs;
    actor.moving = false;
    clearRoute(actor);
    playAnim(spr, npcIdleAnimKey(actor.id));
  }
  spr.setDepth(entityDepth(spr.y));
  syncEntityShadow(spr);
}

export function updateNpcActors(
  actors: NpcActorState[],
  dtMs: number,
  opts?: { schedule?: HavenScheduleSnapshot | null; talkingNpcId?: string | null },
): void {
  const schedule = opts?.schedule;
  const talkingNpcId = opts?.talkingNpcId;
  const dt = Math.min(0.25, Math.max(0,dtMs) / 1000);

  for (const actor of actors) {
    const spr = actor.sprite;
    if (!spr.active) continue;

    const isTalking = talkingNpcId === actor.id;
    if (npcWorldDef(actor.id)?.seated) {
      actor.moving = false;
      spr.setPosition(actor.homeX, actor.homeY).setFlipX(false);
      spr.setDepth(entityDepth(spr.y + 40));
      if (isTalking) { spr.anims.stop(); spr.setFrame(npcSpriteFrame(actor.id)); }
      else playAnim(spr, npcIdleAnimKey(actor.id));
      continue;
    }
    const entry = schedule ? havenScheduleEntryById(schedule, actor.id) : undefined;
    if (isTalking && actor.bubble?.active) {
      spr.scene.tweens?.killTweensOf(actor.bubble);
      actor.bubble.destroy();
      actor.bubble = undefined;
    }
    if (actor.bubble?.active) {
      actor.bubble.setPosition(spr.x, spr.y - 38);
      actor.bubble.setDepth(spr.depth + 2);
    }
    if (actor.barkCd != null) {
      actor.barkCd -= dtMs;
    }
    if (
      !isTalking && !entry?.asleep && actor.homeTransition === 'none' &&
      spr.visible &&
      spr.alpha > 0.8 &&
      (actor.barkCd == null || actor.barkCd <= 0) &&
      INTERACTIVE_NPC_BARKS[actor.id]
    ) {
      const getPlayer = spr.scene.data.get('getPlayerWorldXY') as
        | (() => { x: number; y: number } | null)
        | undefined;
      const player = getPlayer?.() ?? null;
      if (player) {
        const pdx = player.x - spr.x;
        const pdy = player.y - spr.y;
        if (Math.hypot(pdx, pdy) < 68) {
          const pool = INTERACTIVE_NPC_BARKS[actor.id]!;
          const line = pool[Math.floor(Math.random() * pool.length)]!;
          showNpcBark(actor, line);
          actor.barkCd = 14000 + Math.random() * 8000;
        }
      }
    }
    if (entry) {
      actor.serverDriven = true;
      actor.scheduleMode = entry.mode;
      const key = `${entry.phase}:${entry.asleep}`;
      if (actor.scheduleKey !== key) {
        clearRoute(actor);
        actor.target = null;
        actor.wait = 0;
        actor.scheduleKey = key;
      }
      const goingHome = entry.asleep || entry.phase === 'at_home' || entry.phase === 'walking_home';
      if (isTalking && !entry.asleep && actor.homeTransition === 'none' && !actor.asleep) {
        actor.moving = false;
        orientNpcTowardPlayer(spr);
        playAnim(spr, npcIdleAnimKey(actor.id));
        continue;
      }
      if (goingHome) {
        if (followNpcHome(actor, dt)) continue;
      } else if (actor.asleep || actor.homeTransition === 'exiting') {
        if (actor.homeTransition !== 'exiting' && !startNpcHomeTransition(actor, 'exiting')) continue;
        tickNpcHomeTransition(actor, dt);
        continue;
      } else if (actor.homeTransition === 'entering') {
        actor.homeTransition = 'none';
      }
      actor.asleep = false;
      showNpcOutdoors(actor);
      if (isTalking) {
        actor.moving = false;
        orientNpcTowardPlayer(spr);
        playAnim(spr, npcIdleAnimKey(actor.id));
        continue;
      }
      if (entry.phase === 'walking_to_post' || entry.phase === 'patrol') {
        followCommuteOrPatrol(actor, entry, dt);
        continue;
      }
      if (entry.phase === 'at_post' || entry.phase === 'open') {
        if (Math.hypot(actor.homeX - entry.x, actor.homeY - entry.y) > 0.5) {
          actor.homeX = entry.x;
          actor.homeY = entry.y;
          actor.target = null;
          clearRoute(actor);
        }
        actor.wanderRadius = entry.phase === 'open' ? 0 : actor.dayWanderRadius;
        const drift = Math.hypot(spr.x - actor.homeX, spr.y - actor.homeY);
        if (drift > actor.wanderRadius + 16) {
          beginRoute(actor, actor.homeX, actor.homeY);
          walkRoute(actor, dt, Math.max(36, actor.wanderSpeed * 1.45));
          continue;
        }
        updateDayWander(actor, dt * 1000);
        continue;
      }
      continue;
    }

    // Locations without Haven schedule — simple local wander.
    if (isTalking) {
      actor.moving = false;
      orientNpcTowardPlayer(spr);
      playAnim(spr, npcIdleAnimKey(actor.id));
      continue;
    }
    updateDayWander(actor, dt * 1000);
  }

}

export function clearNpcStreetCache(scene?:Phaser.Scene): void {
  clearNpcRouteCache(scene);
}

export function npcActorInteractable(
  actor: NpcActorState,
  entry?: HavenNpcScheduleEntry,
): boolean {
  if (!actor.sprite.active || !actor.sprite.visible || actor.asleep || actor.homeTransition !== 'none') return false;
  if (entry) return entry.interactable && !entry.asleep;
  if (actor.scheduleMode === 'sleep' && actor.asleep) return false;
  return true;
}
