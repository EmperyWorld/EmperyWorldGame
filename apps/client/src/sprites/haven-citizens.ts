import { applyCitizenActivity, faceCitizenToward, type CitizenActivity } from './citizen-activity.js';
import { cityCrowd } from '../game/systems/city-crowd.js';
import { walkCadence, CITY_STEP_DISTANCE } from './walk-cadence.js';
import { CitizenTalkSelection, PLAYER_INTERACTION_LOS_KEY, type InteractionVisibility } from './citizen-interaction.js';
import { ambientPlacement, ambientPatrolPlacement } from './ambient-placement.js';
import { resolveNpcHomeEntrance } from './npc-home-entrance.js';
import { SpatialNeighbors } from '../game/systems/spatial-neighbors.js';
import { CityUpdateClock, advanceStallTimer } from '../game/systems/city-update-clock.js';
import { cityRouteRetryDelay } from '../game/systems/city-route-follower.js';
import Phaser from 'phaser';
import type { HavenAmbientScheduleEntry } from '@empery/shared';
import {
  residentAppearance,
  residentIdentity,
  residentPortraitId,
  havenActorLane,
  pointAlongWorldPath,
  nearestWorldPathSegment,
  worldToHavenTile,
} from '@empery/shared';
import { COMBAT_ATLAS_KEY, playerSpriteFrame, registerCitizenSprite } from './sprite-factory.js';
import { setupSpriteDisplay } from './sprite-loader.js';
import { attachEntityShadow, entityDepth, syncEntityShadow } from './visual-polish.js';
import { isInsidePropAabb, nudgePointFromPropColliders, propCollisionRevision, propCollisionAudit } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';
import { pickContextualGreetingBark } from './citizen-barks.js';
import { mountedYieldCandidates } from './citizen-mounted-yield.js';
import { getHavenSchedule, subscribeHavenSchedule } from '../world-clock.js';
import {
  getGraphicsProfile,
  shouldSpawnAmbientCitizen,
} from '../game/systems/graphics-quality.js';
import { resolveCitizenDistrictNpcId } from './haven-citizen-district.js';
import {
  ALL_CITIZEN_DEFS,
  havenAmbientNightRole,
  type HavenAmbientNightRole,
  type CitizenDef,
  type CitizenLook,
} from './haven-ambient-defs.js';
import { shouldReseedAmbientJoinFromSchedule } from './haven-citizens-join-seed.js';
import { buildNpcRoute, clearNpcRouteCache } from './npc-pathing.js';
import { applyLight2DPipeline } from './light2d-pipeline.js';
import { facingFromDelta, facingNeedsFlipX, facingRow, type SpriteFacingRow } from './facing4.js';

export { resolveCitizenDistrictNpcId };
export { HAVEN_AMBIENT_CITIZEN_DEFS } from './haven-ambient-defs.js';

const TW = 64;
const c = (tx: number, ty: number) =>
  ({ x: tx * TW + TW / 2, y: ty * TW + TW / 2 }) as const;

/** Bounded real-time recovery when a route is blocked. */
const STUCK_TIMEOUT_MS = 1200;
/** Soft repath attempt before skipping a vertex. */
const STUCK_REPATH_MS = 700;
/** Patrols may choose another destination after repeated failures; commutes keep waiting. */
const COMMUTE_REPATH_ABORT = 3;
/** South-of-house doorway anchor + transition speed for enter/exit diagnostics. */
const HOME_TRANSITION_MS = 460;
const HOME_ARRIVAL_PX = 16;
/** Accept near-post arrival to avoid crowd deadlocks in choke points. */
const NEAR_POST_ARRIVE_PX = 36;
const NEAR_POST_ARRIVE_MAX_PX = 64;

export interface AmbientCitizen {
  sprite: Phaser.GameObjects.Sprite;
  path: Array<{ x: number; y: number }>;
  seg: number;
  speed: number;
  pauseMs: number;
  wait: number;
  bobPhase: number;
  walkPhase: number;
  animable: boolean;
  racePrefix: string | null;
  walkFacing?: SpriteFacingRow;
  activity?: CitizenActivity;
  lastTravelDistance?: number;
  constrainStep?: (from: {x:number;y:number}, desired: {x:number;y:number}) => {x:number;y:number}|null;
  bark?: string;
  barkCd: number;
  bubble?: Phaser.GameObjects.Text;
  /** Cooldown after greeting the player. */
  greetCd: number;
  greetHoldMs?: number;
  socialWaitMs?: number;
  yieldTarget?: {x:number;y:number}|null;
  /** Cooldown between mounted-player sidesteps. */
  mountYieldCd: number;
  /** Cooldown for social chat with other citizens. */
  socialCd: number;
  districtNpcId: string;
  districtLabel: string;
  isTalkingToPlayer: boolean;
  /** Daytime routes resume after arrival instead of pulling residents back every frame. */
  dayRoaming:boolean;
  /** Gone indoors during night rest hours. */
  asleep: boolean;
  sleepX: number;
  sleepY: number;
  postX: number;
  postY: number;
  nightPatrolOnly: boolean;
  nightRole: HavenAmbientNightRole;
  courtyardRole?: 'child' | 'parent';
  baseScale: number;
  slotIndex: number;
  /** Last applied schedule key — avoid teleporting on every world-clock tick. */
  schedKey: string;
  /** Client street route (commute + patrol between waypoints). */
  route: Array<{ x: number; y: number }> | null;
  routeSeg: number;
  routeKey: string;
  routeRevision:number;
  routeTarget: { x: number; y: number } | null;
  routeRetryMs: number;
  /** Pure sitter — sway + occasional look-around. */
  sitter: boolean;
  lookCd: number;
  /** Milliseconds without movement progress. */
  stuckMs: number;
  /** Soft repaths during current street route — abort commute when too high. */
  repathCount: number;
  /** Was off-screen / far last tick — used for on-screen road recovery. */
  wasCulled: boolean;
  /** Sidewalk lane (−1 / +1) so crowds don't share the road centerline. */
  lane: -1 | 1;
  homeTransition: 'none' | 'entering' | 'exiting';
  homeTransitionT: number;
  homeStartX: number;
  homeStartY: number;
}

export const PLAYER_XY_KEY = 'getPlayerWorldXY';
export const NIGHT_GUARD_LIGHTS_KEY = 'getNightGuardLights';
export const COURT_PLAYERS_KEY = 'getCourtPlayers';

type PlayerXYFn = () => { x: number; y: number } | null;

const MARKET_BARKS = ['Свежая рыба!', 'Пряности с востока!', 'Не толкайся…', 'Сколько за сыр?'];
const HARBOR_BARKS = ['Прилив через час.', 'Кран занят!', 'Чайки опять…', 'Швартуй крепче.'];
const PLAZA_BARKS = ['К фонтану?', 'Слышал колокол.', 'Стража сегодня строгая.', '…'];
const CHURCH_BARKS = ['Мир вам.', 'Свечи в притворе.', 'Тише у алтаря.'];

function lookFrame(look: CitizenLook, gender: 'male' | 'female' = 'male'): string {
  switch (look) {
    case 'merchant':
      return 'npc-town_merchant-0';
    case 'innkeeper':
      return 'npc-town_innkeeper-0';
    case 'captain':
      return 'npc-town_captain-0';
    case 'blacksmith':
      return 'npc-town_blacksmith-0';
    case 'radio':
      return 'npc-town_radio-0';
    case 'stable':
      return 'npc-town_stable-0';
    case 'mira':
      return 'npc-elder_mira-0';
    case 'hermit':
      return 'npc-silvan_hermit-0';
    case 'elf':
      return playerSpriteFrame('elf', 0, gender);
    case 'orc':
      return playerSpriteFrame('orc', 0, gender);
    case 'human':
    default:
      return playerSpriteFrame('human', 0, gender);
  }
}


const SOCIAL_CHAT_POOLS: Record<string, Array<[string, string]>> = {
  haven_citizen_market: [
    ['Лорен опять поднял цену на масло!', 'Зато мука сегодня отменная, Бран ручается.'],
    ['Караван с востока пришёл вовремя?', 'Да, шелка и пряности уже разгружают.'],
    ['Свежую сельдь уже разобрали?', 'Ульф только полчаса как с причала принёс!'],
  ],
  haven_citizen_plaza: [
    ['Слышал новую балладу Кая в амфитеатре?', 'Да, про воинов Серебряного Леса! Весь форум аплодировал.'],
    ['Видел новый указ на доске объявлений?', 'За головы нежити на болотах платят звонкой аденой!'],
    ['Вода в фонтане сегодня свежая и холодная.', 'Служители Собора утром освящали исток.'],
    ['После колокола здесь тише, чем днём.', 'Ночной ряд шепчет. Стража делает вид, что не слышит.'],
  ],
  haven_citizen_harbor: [
    ['Чайки кружат низко над молом — к шторму?', 'Старый боцман говорит, просто прилив ранний.'],
    ['Кран у причала починили наконец?', 'Петр до полудня цепи менял, теперь ход плавный.'],
    ['Куда этот бриг держит курс?', 'К Звёздному Бастиону, за железной рудой.'],
  ],
  haven_citizen_cathedral: [
    ['Отец Кассиан сегодня проводит вечернюю службу?', 'Сразу после звона колокола, как спадёт жара.'],
    ['Свечи из горного воска привезли?', 'Да, в притворе теперь пахнет мёдом и ладаном.'],
    ['Мир твоему дому, брат.', 'И твоему покой под сводами Собора.'],
  ],
  haven_citizen_craft: [
    ['Гарольд с рассвета молотом звенит.', 'Заказ стражи на новые наконечники стрел.'],
    ['Уголь в этот раз жаркий привезли.', 'Пламя синее, закалка будет крепкой!'],
  ],
  haven_citizen_tavern: [
    ['Вечером к Марте на кружку эля?', 'Если места за столом с костями останутся!'],
    ['В бане у Ники пар сегодня знатный.', 'Хвойный веник и чабрец — усталость как рукой снимает.'],
  ],
  haven_citizen_guard: [
    ['У восточных ворот всё спокойно?', 'Тихо. Караван пропустили, бродяг отогнали.'],
    ['Смена через час?', 'Да, погреемся у очага в казарме.'],
  ],
};

function pickBark(def: CitizenDef): string | undefined {
  if (def.bark) return def.bark;
  const t0 = def.tiles[0];
  if (!t0) return undefined;
  const [tx, ty] = t0;
  if (tx < 20 && ty > 14 && ty < 26) return MARKET_BARKS[(tx + ty) % MARKET_BARKS.length];
  if (tx > 55 && ty > 44) return HARBOR_BARKS[(tx + ty) % HARBOR_BARKS.length];
  if (tx > 45 && tx < 56 && ty < 16) return CHURCH_BARKS[(tx + ty) % CHURCH_BARKS.length];
  if (tx > 34 && tx < 48 && ty > 16 && ty < 28) return PLAZA_BARKS[(tx + ty) % PLAZA_BARKS.length];
  return undefined;
}

function citizenSchedKey(entry: HavenAmbientScheduleEntry): string {
  return `${entry.phase}:${entry.asleep ? 1 : 0}`;
}

function citizenLifeDebugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('npcLifeDebug');
  } catch {
    return false;
  }
}

const NPC_LIFE_EVENTS_KEY = '__EW_NPC_LIFE_EVENTS';
const NPC_LIFE_EVENTS_MAX = 180;

type NpcLifeEvent = {
  ts: number;
  slot: number;
  npc: string;
  reason: string;
  schedKey: string;
  transition: AmbientCitizen['homeTransition'];
  x: number;
  y: number;
  sleepX: number;
  sleepY: number;
  postX: number;
  postY: number;
  routeSeg: number;
  routeLen: number;
  extra?: Record<string, unknown>;
};

function pushCitizenLifeEvent(event: NpcLifeEvent): void {
  try {
    const root = globalThis as typeof globalThis & { [NPC_LIFE_EVENTS_KEY]?: NpcLifeEvent[] };
    const prev = root[NPC_LIFE_EVENTS_KEY];
    const list = Array.isArray(prev) ? prev : [];
    const last = list.length > 0 ? list[list.length - 1] : null;
    if (
      last &&
      last.slot === event.slot &&
      last.reason === event.reason &&
      last.schedKey === event.schedKey &&
      last.transition === event.transition &&
      event.ts - last.ts < 1200
    ) {
      return;
    }
    list.push(event);
    if (list.length > NPC_LIFE_EVENTS_MAX) {
      list.splice(0, list.length - NPC_LIFE_EVENTS_MAX);
    }
    root[NPC_LIFE_EVENTS_KEY] = list;
  } catch {
    /* optional debug store */
  }
}

function debugCitizenLife(cit: AmbientCitizen, reason: string, extra?: Record<string, unknown>): void {
  const payload = {
    ts: Date.now(),
    slot: cit.slotIndex,
    npc: cit.districtNpcId,
    reason,
    schedKey: cit.schedKey,
    transition: cit.homeTransition,
    x: Math.round(cit.sprite.x),
    y: Math.round(cit.sprite.y),
    sleepX: Math.round(cit.sleepX),
    sleepY: Math.round(cit.sleepY),
    postX: Math.round(cit.postX),
    postY: Math.round(cit.postY),
    routeSeg: cit.routeSeg,
    routeLen: cit.route?.length ?? 0,
    extra,
  } satisfies NpcLifeEvent;
  pushCitizenLifeEvent(payload);
  if (!citizenLifeDebugEnabled()) return;
  console.info('[haven-citizens]', payload);
}

function hideCitizenIndoors(cit: AmbientCitizen, reason = 'hide_indoors'): void {
  cit.asleep = true;
  cit.homeTransition = 'none';
  cit.homeTransitionT = 0;
  const spr = cit.sprite;
  if (cit.bubble?.active) {
    spr.scene.tweens.killTweensOf(cit.bubble);
    cit.bubble.destroy();
    cit.bubble = undefined;
  }
  spr.setVisible(false);
  spr.setAlpha(0);
  spr.clearTint();
  spr.setScale(cit.baseScale);
  spr.setPosition(cit.sleepX, cit.sleepY);
  syncEntityShadow(spr);
  debugCitizenLife(cit, reason);
}

function showCitizenOutdoors(cit: AmbientCitizen): void {
  const spr = cit.sprite;
  const wasInvisible = !spr.visible || spr.alpha < 0.98;
  spr.setVisible(true);
  spr.setAlpha(1);
  spr.clearTint();
  spr.setScale(cit.baseScale);
  syncEntityShadow(spr);
  if (wasInvisible) debugCitizenLife(cit, 'show_outdoors');
}

function homeDoorPose(cit: AmbientCitizen): { x: number; y: number } | null {
  return resolveNpcHomeEntrance(cit.sprite.scene, cit.sleepX, cit.sleepY);
}

function startHomeEnterTransition(cit: AmbientCitizen): void {
  const spr = cit.sprite;
  const door = homeDoorPose(cit);
  if (!door) return;
  clearStreetRoute(cit);
  cit.homeTransition = 'entering';
  cit.homeTransitionT = 0;
  cit.homeStartX = spr.x;
  cit.homeStartY = spr.y;
  cit.asleep = false;
  showCitizenOutdoors(cit);
  spr.setFlipX(false);
  debugCitizenLife(cit, 'home_enter_start', { doorX: Math.round(door.x), doorY: Math.round(door.y) });
}

function startHomeExitTransition(cit: AmbientCitizen): boolean {
  const door = homeDoorPose(cit);
  if (!door) return false;
  clearStreetRoute(cit);
  cit.homeTransition = 'exiting';
  cit.homeTransitionT = 0;
  cit.asleep = false;
  showCitizenOutdoors(cit);
  cit.sprite.setPosition(cit.sleepX, cit.sleepY);
  cit.sprite.setAlpha(0.08);
  cit.sprite.setFlipX(false);
  debugCitizenLife(cit, 'home_exit_start', { doorX: Math.round(door.x), doorY: Math.round(door.y) });
  return true;
}

function clearStreetRoute(cit: AmbientCitizen): void {
  cit.route = null;
  cit.routeSeg = 0;
  cit.routeKey = '';
  cit.repathCount = 0;
  cit.stuckMs = 0;
  cit.routeTarget = null;
  cit.routeRetryMs = 0;
}

function streetCacheKey(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  lane: -1 | 1,
): string {
  const [fx, fy] = worldToHavenTile(fromX, fromY);
  const [tx, ty] = worldToHavenTile(toX, toY);
  return `${fx},${fy}>${tx},${ty}:L${lane}`;
}

export function beginStreetRoute(
  cit: AmbientCitizen,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  restart: boolean,
): void {
  const key = streetCacheKey(fromX, fromY, toX, toY, cit.lane);
  if (!restart && cit.route && cit.routeKey === key) return;
  if (cit.routeTarget?.x !== toX || cit.routeTarget?.y !== toY) cit.repathCount = 0;
  cit.routeTarget = { x: toX, y: toY };
  cit.routeRetryMs = 0;
  cit.route = buildNpcRoute(cit.sprite.scene, fromX, fromY, toX, toY, cit.lane);
  cit.routeRevision=propCollisionRevision(cit.sprite.scene);
  cit.routeSeg = 0;
  cit.routeKey = key;
  cit.stuckMs = 0;
  if (cit.route.length > 1)cit.routeSeg=nearestWorldPathSegment(cit.route,cit.sprite.x,cit.sprite.y);
}

/** Place on street polyline at walkT (join mid-commute). */
function placeOnCommute(
  cit: AmbientCitizen,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  walkT: number,
): void {
  const route = buildNpcRoute(cit.sprite.scene, fromX, fromY, toX, toY, cit.lane);
  const pos = route.length?pointAlongWorldPath(route, walkT):{x:fromX,y:fromY};
  cit.sprite.setPosition(pos.x, pos.y);
  cit.route = route;
  cit.routeRevision=propCollisionRevision(cit.sprite.scene);
  cit.routeKey = streetCacheKey(fromX, fromY, toX, toY, cit.lane);
  cit.routeTarget = { x: toX, y: toY };
  cit.routeRetryMs = 0;
  cit.routeSeg = Math.min(nearestWorldPathSegment(route, pos.x, pos.y), Math.max(0, route.length - 2));
  cit.stuckMs = 0;
}

/** Walk the current street route at citizen speed. Returns true when finished. */
function deferStreetRoute(cit: AmbientCitizen): void {
  cit.repathCount += 1;
  cit.routeRetryMs = cityRouteRetryDelay(cit.repathCount);
  cit.route = [];
  cit.routeSeg = 0;
  cit.stuckMs = 0;
  tickCitizenWalkAnim(cit, 0, false);
}

export function walkStreetRoute(cit: AmbientCitizen, dt: number, collide = true): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  dt = Math.min(dt, 0.5);
  if (cit.routeTarget && cit.routeRevision !== propCollisionRevision(cit.sprite.scene)) {
    cit.repathCount = 0;
    beginStreetRoute(cit, cit.sprite.x, cit.sprite.y, cit.routeTarget.x, cit.routeTarget.y, true);
  }
  if (cit.routeRetryMs > 0) {
    cit.routeRetryMs = Math.max(0, cit.routeRetryMs - dt * 1000);
    if (cit.routeRetryMs === 0 && cit.routeTarget) {
      beginStreetRoute(cit, cit.sprite.x, cit.sprite.y, cit.routeTarget.x, cit.routeTarget.y, true);
    }
    return false;
  }
  const route = cit.route;
  if (!route || route.length === 0) {
    cit.stuckMs+=dt*1000;
    if(cit.stuckMs>=STUCK_TIMEOUT_MS) deferStreetRoute(cit);
    return false;
  }
  const speed = Math.max(cit.speed, 36);
  let remaining=dt;
  for (let guard = 0; guard < 64; guard++) {
    if (cit.routeSeg >= route.length - 1) {
      return finishStreetRoute(cit);
    }
    const to = route[cit.routeSeg + 1]!;
    const beforeX=cit.sprite.x,beforeY=cit.sprite.y;
    const arrived=walkCitizen(cit,remaining,to.x,to.y,speed,{collide});
    remaining=Math.max(0,remaining-(cit.lastTravelDistance??Math.hypot(cit.sprite.x-beforeX,cit.sprite.y-beforeY))/speed);
    if (arrived) {
      cit.routeSeg += 1;
      cit.stuckMs = 0;
      if(remaining<1e-6)return cit.routeSeg>=route.length-1 ? finishStreetRoute(cit) : false;
      continue;
    }
    // Retry from the actual pose. A blocked vertex never counts as arrival.
    if (cit.stuckMs >= STUCK_REPATH_MS) {
      deferStreetRoute(cit);
      return false;
    }
    return false;
  }
  return cit.routeSeg >= route.length - 1 ? finishStreetRoute(cit) : false;
}

function finishStreetRoute(cit: AmbientCitizen): boolean {
  const goal = cit.routeTarget;
  if (goal && Math.hypot(cit.sprite.x - goal.x, cit.sprite.y - goal.y) > 6) {
    deferStreetRoute(cit);
    return false;
  }
  clearStreetRoute(cit);
  return true;
}

function resumeDayPath(cit: AmbientCitizen): void {
  cit.dayRoaming=true;
  clearStreetRoute(cit);
  const spr = cit.sprite;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < cit.path.length; i++) {
    const p = cit.path[i]!;
    const d = Math.hypot(p.x - spr.x, p.y - spr.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  cit.seg = best;
  cit.wait = Math.min(cit.wait, 280);
  cit.stuckMs = 0;
}

/** Seed deterministic day patrol pose from authoritative server time. */
function seedDayPatrolFromServer(cit: AmbientCitizen, serverAt: number): void {
  cit.dayRoaming=true;
  if (cit.path.length < 2 || cit.speed <= 0) {
    cit.sprite.setPosition(cit.postX, cit.postY);
    resumeDayPath(cit);
    return;
  }
  const moveMs = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const speed = Math.max(cit.speed, 20);
    return (dist / speed) * 1000;
  };

  let cycleMs = 0;
  for (let i = 0; i < cit.path.length; i++) {
    const from = cit.path[i]!;
    const to = cit.path[(i + 1) % cit.path.length]!;
    cycleMs += cit.pauseMs + moveMs(from, to);
  }
  if (cycleMs <= 1) {
    cit.sprite.setPosition(cit.postX, cit.postY);
    resumeDayPath(cit);
    return;
  }

  let t = ((serverAt + cit.slotIndex * 997 + (cit.lane > 0 ? 431 : 0)) % cycleMs + cycleMs) % cycleMs;
  for (let i = 0; i < cit.path.length; i++) {
    const from = cit.path[i]!;
    const to = cit.path[(i + 1) % cit.path.length]!;
    if (t < cit.pauseMs) {
      cit.sprite.setPosition(from.x, from.y);
      clearStreetRoute(cit);
      cit.seg = i;
      cit.wait = cit.pauseMs - t;
      cit.stuckMs = 0;
      return;
    }
    t -= cit.pauseMs;
    const segMoveMs = moveMs(from, to);
    if (t < segMoveMs) {
      const walkT = segMoveMs > 0 ? t / segMoveMs : 0;
      const route = buildNpcRoute(cit.sprite.scene, from.x, from.y, to.x, to.y, cit.lane);
      const pos = route.length?pointAlongWorldPath(route, walkT):{x:from.x,y:from.y};
      cit.sprite.setPosition(pos.x, pos.y);
      cit.route = route;
      cit.routeRevision=propCollisionRevision(cit.sprite.scene);
      cit.routeKey = streetCacheKey(from.x, from.y, to.x, to.y, cit.lane);
      cit.routeTarget = { x: to.x, y: to.y };
      cit.routeRetryMs = 0;
      cit.routeSeg = Math.min(
        nearestWorldPathSegment(route, pos.x, pos.y),
        Math.max(0, route.length - 2),
      );
      cit.seg = i;
      cit.wait = 0;
      cit.stuckMs = 0;
      return;
    }
    t -= segMoveMs;
  }

  cit.sprite.setPosition(cit.postX, cit.postY);
  resumeDayPath(cit);
}

/**
 * Apply schedule pose. Hard teleports only on force join —
 * phase flips start a street walk from the *current* position.
 */
export function snapCitizenToSchedule(
  cit: AmbientCitizen,
  entry: HavenAmbientScheduleEntry,
  opts?: { force?: boolean; serverAt?: number },
): void {
  const spr = cit.sprite;
  const force = Boolean(opts?.force);
  const nextKey = citizenSchedKey(entry);
  const phaseChanged = cit.schedKey !== nextKey;
  if (phaseChanged) {
    debugCitizenLife(cit, 'schedule_phase_change', {
      nextPhase: entry.phase,
      asleep: entry.asleep,
      walkT: Number(entry.walkT.toFixed(3)),
    });
  }
  cit.schedKey = nextKey;

  if (entry.phase === 'hidden') {
    cit.dayRoaming=false;
    clearStreetRoute(cit);
    hideCitizenIndoors(cit, 'snap_phase_hidden');
    return;
  }

  if (cit.nightPatrolOnly && entry.phase === 'patrol') {
    // Live shift changes leave the doorway exit and return-to-post walk to the frame loop.
    if (!force) return;
    cit.asleep = false;
    cit.dayRoaming = true;
    showCitizenOutdoors(cit);
    return;
  }

  if (entry.phase === 'at_home' || (entry.asleep && entry.phase !== 'walking_to_post')) {
    cit.dayRoaming = false;
    // Initial joins seed the authoritative indoor pose. Live residents finish their walk.
    if (force || cit.asleep || !spr.visible) {
      clearStreetRoute(cit);
      hideCitizenIndoors(cit, 'snap_phase_at_home');
    } else if (cit.homeTransition !== 'entering') {
      const door = homeDoorPose(cit);
      if (!door) { clearStreetRoute(cit); return; }
      beginStreetRoute(cit, spr.x, spr.y, door.x, door.y, true);
    }
    return;
  }

  if (entry.phase === 'walking_home' || entry.phase === 'walking_to_post') {
    const hiddenNow = cit.asleep || !spr.visible || spr.alpha < 0.98;
    const goingHome = entry.phase === 'walking_home';
    const door = homeDoorPose(cit);
    if (!door) { clearStreetRoute(cit); return; }
    const fromX = goingHome ? cit.postX : door.x;
    const fromY = goingHome ? cit.postY : door.y;
    const toX = goingHome ? door.x : cit.postX;
    const toY = goingHome ? door.y : cit.postY;
    if (phaseChanged) {
      cit.dayRoaming = false;
      clearStreetRoute(cit);
    }
    if (!force && cit.homeTransition === 'entering' && goingHome) return;
    if (!force && goingHome && cit.asleep) return;
    if (force) {
      showCitizenOutdoors(cit);
      cit.asleep = false;
      debugCitizenLife(cit, 'snap_force_commute', { phase: entry.phase, walkT: Number(entry.walkT.toFixed(3)) });
      placeOnCommute(cit, fromX, fromY, toX, toY, entry.walkT);
      return;
    }
    // Keep hidden sleepers hidden; per-frame logic will play explicit home exit.
    if (!goingHome && hiddenNow) {
      debugCitizenLife(cit, 'snap_walk_to_post_defer_hidden');
      clearStreetRoute(cit);
      return;
    }
    showCitizenOutdoors(cit);
    cit.asleep = false;
    if (phaseChanged || !cit.route) {
      beginStreetRoute(cit, spr.x, spr.y, toX, toY, true);
    }
    return;
  }

  if (entry.phase === 'at_post') {
    if (!force && (cit.asleep || !spr.visible || cit.homeTransition === 'exiting')) return;
    if (!force && cit.dayRoaming) return;
    cit.asleep = false;
    showCitizenOutdoors(cit);
    if (force && typeof opts?.serverAt === 'number') {
      debugCitizenLife(cit, 'snap_force_day_seed', { serverAt: opts.serverAt });
      seedDayPatrolFromServer(cit, opts.serverAt);
      return;
    }
    if (force) {
      debugCitizenLife(cit, 'snap_post_hard', {
        force,
        gap: Math.round(Math.hypot(spr.x - cit.postX, spr.y - cit.postY)),
      });
      spr.setPosition(cit.postX, cit.postY);
    } else if (Math.hypot(spr.x - cit.postX, spr.y - cit.postY) > 40) {
      // Keep continuity: on live ticks walk back to post, do not hard-teleport.
      debugCitizenLife(cit, 'snap_post_route_recover', {
        gap: Math.round(Math.hypot(spr.x - cit.postX, spr.y - cit.postY)),
      });
      beginStreetRoute(cit, spr.x, spr.y, cit.postX, cit.postY, true);
      return;
    }
    resumeDayPath(cit);
  }
}

/**
 * Per-frame schedule follow. Returns true if day-path AI should be skipped.
 */
function followCitizenHome(
  cit: AmbientCitizen,
  dt: number,
  collide: boolean,
  phaseChanged: boolean,
): boolean {
  cit.dayRoaming = false;
  if (cit.asleep && cit.homeTransition === 'none') return true;
  if (cit.homeTransition === 'exiting') {
    cit.homeTransition = 'none';
    cit.sprite.setAlpha(1);
  }
  if (tickHomeTransition(cit, dt)) return true;
  cit.asleep = false;
  showCitizenOutdoors(cit);
  const spr = cit.sprite;
  const door = homeDoorPose(cit);
  if (!door) { clearStreetRoute(cit); tickCitizenWalkAnim(cit, dt, false); return true; }
  if (Math.hypot(door.x - spr.x, door.y - spr.y) <= HOME_ARRIVAL_PX) {
    clearStreetRoute(cit);
    startHomeEnterTransition(cit);
    return true;
  }
  if (phaseChanged || !cit.route) {
    beginStreetRoute(cit, spr.x, spr.y, door.x, door.y, true);
  }
  if (walkStreetRoute(cit, dt, collide)) {
    if (Math.hypot(door.x - spr.x, door.y - spr.y) <= HOME_ARRIVAL_PX) {
      startHomeEnterTransition(cit);
    } else {
      // An adjusted endpoint can be safe yet still too far from the doorway.
      beginStreetRoute(cit, spr.x, spr.y, door.x, door.y, true);
      deferStreetRoute(cit);
    }
  }
  return true;
}

export function applyCitizenSchedule(
  cit: AmbientCitizen,
  entry: HavenAmbientScheduleEntry,
  dt: number,
  opts?: { collide?: boolean },
): boolean {
  const spr = cit.sprite;
  const collide = opts?.collide !== false;
  const nextKey = citizenSchedKey(entry);
  const phaseChanged = cit.schedKey !== nextKey;
  cit.schedKey = nextKey;
  const alreadyHiddenAsleep = cit.asleep && !spr.visible && spr.alpha < 0.05 && !cit.route && cit.homeTransition === 'none';

  if (entry.phase === 'hidden') {
    cit.dayRoaming=false;
    if (alreadyHiddenAsleep && !phaseChanged) return true;
    cit.homeTransition = 'none';
    clearStreetRoute(cit);
    hideCitizenIndoors(cit, 'phase_hidden');
    return true;
  }

  if (cit.nightPatrolOnly && entry.phase === 'patrol') {
    if (cit.asleep || !spr.visible || cit.homeTransition === 'exiting' || !cit.dayRoaming) {
      return applyCitizenSchedule(cit, { phase: 'walking_to_post', asleep: false, walkT: 1 }, dt, opts);
    }
    cit.asleep = false;
    showCitizenOutdoors(cit);
    return false;
  }

  if (entry.phase === 'at_home' || (entry.asleep && entry.phase !== 'walking_to_post')) {
    return followCitizenHome(cit, dt, collide, phaseChanged);
  }

  if (entry.phase === 'walking_home') {
    return followCitizenHome(cit, dt, collide, phaseChanged);
  }

  if (entry.phase === 'walking_to_post') {
    if(phaseChanged)cit.dayRoaming=false;
    if(cit.dayRoaming)return false;
    const wasHiddenOrAsleep = cit.asleep || !spr.visible;
    const arriveTol = arriveToleranceForWalkT(entry.walkT);
    if (cit.homeTransition === 'entering') {
      cit.homeTransition = 'none';
      showCitizenOutdoors(cit);
      spr.setAlpha(1);
    }
    if (cit.homeTransition === 'exiting' || wasHiddenOrAsleep) {
      if (cit.homeTransition !== 'exiting' && !startHomeExitTransition(cit)) return true;
      if (tickHomeTransition(cit, dt)) return true;
    }
    cit.asleep = false;
    showCitizenOutdoors(cit);
    if (!phaseChanged && Math.hypot(spr.x - cit.postX, spr.y - cit.postY) < arriveTol) {
      resumeDayPath(cit);
      return false;
    }
    if (phaseChanged || !cit.route) {
      cit.repathCount = 0;
      beginStreetRoute(cit, spr.x, spr.y, cit.postX, cit.postY, true);
    }
    if (walkStreetRoute(cit, dt, collide)) {
      const gap = Math.hypot(spr.x - cit.postX, spr.y - cit.postY);
      if (gap <= arriveTol) {
        resumeDayPath(cit);
        return false;
      }
      beginStreetRoute(cit, spr.x, spr.y, cit.postX, cit.postY, true);
      deferStreetRoute(cit);
    }
    return true;
  }

  if (entry.phase === 'at_post') {
    if(cit.dayRoaming)return false;
    if (cit.asleep || !spr.visible || cit.homeTransition === 'exiting') {
      if (cit.homeTransition !== 'exiting' && !startHomeExitTransition(cit)) return true;
      if (tickHomeTransition(cit, dt)) return true;
    }
    cit.asleep = false;
    showCitizenOutdoors(cit);
    const arriveTol = arriveToleranceForWalkT(entry.walkT);
    if (cit.homeTransition !== 'none') {
      cit.homeTransition = 'none';
      showCitizenOutdoors(cit);
      spr.setAlpha(1);
    }
    const dist = Math.hypot(spr.x - cit.postX, spr.y - cit.postY);
    if (dist > 40) {
      if (phaseChanged || !cit.route) {
        cit.repathCount = 0;
        beginStreetRoute(cit, spr.x, spr.y, cit.postX, cit.postY, true);
      }
      if (!walkStreetRoute(cit, dt, collide)) return true;
      if (Math.hypot(spr.x - cit.postX, spr.y - cit.postY) > arriveTol) {
        beginStreetRoute(cit, spr.x, spr.y, cit.postX, cit.postY, true);
        deferStreetRoute(cit);
        return true;
      }
    }
    resumeDayPath(cit);
    return false;
  }

  return false;
}

function tickCitizenWalkAnim(cit: AmbientCitizen, dt: number, moving: boolean, distance = cit.speed * dt): void {
  const spr = cit.sprite;
  if (!cit.racePrefix) return;
  spr.anims.timeScale = moving ? walkCadence(dt > 0 ? distance / dt : 0, 36) : 1;
  const row = cit.walkFacing ?? 'down';
  const rowPrefix = row === 'down' ? cit.racePrefix : `${cit.racePrefix}-${row}`;
  const north = row === 'up' || row === 'up-side';
  const directionalFrame = `${rowPrefix}-0`;
  const northFrame = `${cit.racePrefix}-up-0`;
  const posePrefix = spr.texture?.has(directionalFrame) ? rowPrefix : north && spr.texture?.has(northFrame) ? `${cit.racePrefix}-up` : cit.racePrefix;
  const directionalWalk = `${cit.racePrefix}-walk-${row}`;
  const walkKey = spr.scene.anims.exists(directionalWalk) ? directionalWalk : `${cit.racePrefix}-walk`;
  const idleKey = `${cit.racePrefix}-idle`;
  if (posePrefix !== cit.racePrefix && (!moving || !spr.scene.anims.exists(directionalWalk))) {
    if (spr.anims.isPlaying) spr.anims.stop();
    if (moving) cit.walkPhase += distance / CITY_STEP_DISTANCE;
    const f = moving ? [1, 2, 3, 2][Math.floor(cit.walkPhase) % 4]! : 0;
    const frame = `${posePrefix}-${f}`;
    if (spr.texture.has(frame)) spr.setFrame(frame);
    return;
  }
  if (spr.scene.anims.exists(walkKey) || spr.scene.anims.exists(idleKey)) {
    if (moving && spr.scene.anims.exists(walkKey)) {
      if (!spr.anims.isPlaying || spr.anims.currentAnim?.key !== walkKey) {
        spr.anims.play(walkKey, true);
      }
      return;
    }
    if (!moving && spr.scene.anims.exists(idleKey)) {
      if (!spr.anims.isPlaying || spr.anims.currentAnim?.key !== idleKey) {
        spr.anims.play(idleKey, true);
      }
      return;
    }
    if (spr.anims.isPlaying) {
      spr.anims.stop();
    }
  }
  if (!cit.animable) return;
  const atlas = spr.texture;
  const idle = `${cit.racePrefix}-0`;
  if (!moving) {
    if (spr.anims.isPlaying) spr.anims.stop();
    if (atlas.has(idle)) spr.setFrame(idle);
    return;
  }
  cit.walkPhase += distance / CITY_STEP_DISTANCE;
  const f = 1 + (Math.floor(cit.walkPhase) % 3);
  const frame = `${cit.racePrefix}-${f}`;
  if (spr.anims.isPlaying) spr.anims.stop();
  if (atlas.has(frame)) spr.setFrame(frame);
  else if (atlas.has(idle)) spr.setFrame(idle);
}

function tickCitizenNorthAnim(cit: AmbientCitizen, dt: number, moving: boolean): void {
  const spr = cit.sprite;
  const prefix = cit.racePrefix;
  const atlas = spr.texture;
  if (!prefix) {
    tickCitizenWalkAnim(cit, dt, moving);
    spr.setFlipX(false);
    return;
  }
  if (!moving) {
    const idleUp = `${prefix}-up-0`;
    if (atlas.has(idleUp)) {
      if (spr.anims.isPlaying) spr.anims.stop();
      spr.setFrame(idleUp);
      spr.setFlipX(false);
      return;
    }
    tickCitizenWalkAnim(cit, dt, false);
    spr.setFlipX(false);
    return;
  }
  cit.walkPhase += dt * 9;
  const f = 1 + (Math.floor(cit.walkPhase) % 3);
  const up = `${prefix}-up-${f}`;
  if (atlas.has(up)) {
    if (spr.anims.isPlaying) spr.anims.stop();
    spr.setFrame(up);
    spr.setFlipX(false);
    return;
  }
  tickCitizenWalkAnim(cit, dt, true);
  spr.setFlipX(false);
}

function tickHomeTransition(cit: AmbientCitizen, dt: number): boolean {
  if (cit.homeTransition === 'none') return false;
  const spr = cit.sprite;
  const door = homeDoorPose(cit);
  if (!door) return true;
  cit.homeTransitionT = Math.min(1, cit.homeTransitionT + (dt * 1000) / HOME_TRANSITION_MS);
  const t = cit.homeTransitionT;
  if (cit.homeTransition === 'entering') {
    const x = Phaser.Math.Linear(cit.homeStartX, door.x, Math.min(1, t * 2));
    const y = Phaser.Math.Linear(cit.homeStartY, cit.sleepY, t);
    spr.setPosition(x, y);
    spr.setAlpha(Math.max(0, 1 - t * 0.92));
    tickCitizenNorthAnim(cit, dt, t < 1);
    spr.setDepth(entityDepth(spr.y));
    syncEntityShadow(spr);
    if (t >= 1) {
      cit.homeTransition = 'none';
      hideCitizenIndoors(cit, 'home_enter_done_hide');
    }
    return true;
  }
  const y = Phaser.Math.Linear(cit.sleepY, door.y, t);
  spr.setPosition(door.x, y);
  spr.setAlpha(Math.min(1, 0.08 + t * 0.92));
  cit.walkFacing = 'down';
  tickCitizenWalkAnim(cit, dt, t < 1);
  spr.setFlipX(false);
  spr.setDepth(entityDepth(spr.y));
  syncEntityShadow(spr);
  if (t >= 1) {
    cit.homeTransition = 'none';
    spr.setAlpha(1);
    debugCitizenLife(cit, 'home_exit_done');
  }
  return true;
}

function walkCitizen(
  cit: AmbientCitizen,
  dt: number,
  destX: number,
  destY: number,
  minSpeed = 28,
  opts?: { collide?: boolean },
): boolean {
  const spr = cit.sprite;
  const collide = opts?.collide !== false;
  cit.lastTravelDistance = 0;
  const dx = destX - spr.x;
  const dy = destY - spr.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.05) {
    spr.setPosition(destX, destY);
    cit.stuckMs = 0;
    if (collide) {
      spr.setDepth(entityDepth(destY));
      syncEntityShadow(spr);
      tickCitizenWalkAnim(cit, dt, false);
    }
    return true;
  }
  const beforeX = spr.x;
  const beforeY = spr.y;
  const distance = Math.min(Math.max(cit.speed, minSpeed) * dt, dist);
  // Deferred offscreen updates have larger budgets: test the entire segment,
  // retaining safe partial progress when a new obstacle interrupts it.
  let travelled = 0;
  while (travelled < distance - 0.001) {
    const from = {x:spr.x,y:spr.y};
    const remaining = Math.hypot(destX-from.x,destY-from.y);
    if (remaining < 0.001) break;
    const step = Math.min(distance-travelled,8,remaining);
    const desired = {x:from.x+(destX-from.x)/remaining*step,y:from.y+(destY-from.y)/remaining*step};
    const next = collide && cit.constrainStep ? cit.constrainStep(from,desired) : desired;
    if (!next || (collide && (isTileBlockedAt(spr.scene,next.x,next.y)||isInsidePropAabb(spr.scene,next.x,next.y,13)))) break;
    const actual = Math.hypot(next.x-from.x,next.y-from.y);
    if (actual < 0.001) break;
    spr.setPosition(next.x,next.y);
    travelled += actual;
  }
  cit.lastTravelDistance = travelled;
  const moved = Math.hypot(spr.x - beforeX, spr.y - beforeY);
  const facing = facingFromDelta(spr.x - beforeX, spr.y - beforeY, 0.01);
  if (facing) cit.walkFacing = facingRow(facing);
  cit.stuckMs=advanceStallTimer(cit.stuckMs,moved,dt*1000);
  if (collide) {
    if (facing) spr.setFlipX(facingNeedsFlipX(facing));
    spr.setDepth(entityDepth(spr.y));
    syncEntityShadow(spr);
    tickCitizenWalkAnim(cit, dt, travelled > 0.001, travelled);
  }
  return Math.hypot(spr.x-destX,spr.y-destY)<0.05;
}

function arriveToleranceForWalkT(walkT: number): number {
  const t = Math.max(0, Math.min(1, walkT));
  const k = Math.max(0, (t - 0.7) / 0.3);
  return Math.round(NEAR_POST_ARRIVE_PX + (NEAR_POST_ARRIVE_MAX_PX - NEAR_POST_ARRIVE_PX) * k);
}

/** Advance day/night patrol along street corridors between waypoints. */
function walkPatrolSegment(cit: AmbientCitizen, dt: number, collide: boolean): void {
  if (cit.path.length < 2 || cit.speed <= 0) return;
  if (cit.wait > 0) {
    cit.wait -= dt * 1000;
    tickCitizenWalkAnim(cit, dt, false);
    return;
  }
  const to = cit.path[(cit.seg + 1) % cit.path.length]!;
  const destChanged = cit.routeTarget?.x !== to.x || cit.routeTarget?.y !== to.y;
  const topologyChanged=cit.routeRevision!==propCollisionRevision(cit.sprite.scene);
  if (!cit.route || destChanged || topologyChanged) {
    beginStreetRoute(cit, cit.sprite.x, cit.sprite.y, to.x, to.y, true);
  }
  if (
    walkStreetRoute(cit, dt, collide) ||
    cit.repathCount >= COMMUTE_REPATH_ABORT ||
    cit.stuckMs >= STUCK_TIMEOUT_MS
  ) {
    cit.seg = (cit.seg + 1) % cit.path.length;
    cit.wait = cit.activity?.durationMs ?? cit.pauseMs;
    applyCitizenActivity(cit,cit.activity);
    cit.stuckMs = 0;
    cit.repathCount = 0;
    clearStreetRoute(cit);
    tickCitizenWalkAnim(cit, dt, false);
  }
}

function showBark(scene: Phaser.Scene, cit: AmbientCitizen, text: string): void {
  if (cit.bubble?.active) {
    scene.tweens.killTweensOf(cit.bubble);
    cit.bubble.destroy();
  }
  cit.bubble = undefined;
  const bubble = scene.add
    .text(cit.sprite.x, cit.sprite.y - 36, text, {
      color: '#f8f0e0',
      fontSize: '11px',
      backgroundColor: '#00000099',
      padding: { x: 5, y: 2 },
    })
    .setOrigin(0.5)
    .setDepth(cit.sprite.depth + 2);
  cit.bubble = bubble;
  scene.tweens.add({
    targets: bubble,
    alpha: 0,
    duration: 2200,
    ease: 'Sine.easeIn',
    onComplete: () => {
      bubble.destroy();
      if (cit.bubble === bubble) cit.bubble = undefined;
    },
  });
}

function triggerCitizenSocialChat(
  scene: Phaser.Scene,
  citA: AmbientCitizen,
  citB: AmbientCitizen,
): void {
  citA.wait = 3200;
  citB.wait = 3200;
  citA.socialWaitMs = citB.socialWaitMs = 3200;
  faceCitizenToward(citA,citB.sprite);
  faceCitizenToward(citB,citA.sprite);
  tickCitizenWalkAnim(citA,0,false);
  tickCitizenWalkAnim(citB,0,false);

  const pool =
    SOCIAL_CHAT_POOLS[citA.districtNpcId] ??
    SOCIAL_CHAT_POOLS[citB.districtNpcId] ??
    SOCIAL_CHAT_POOLS.haven_citizen_plaza!;
  const pair = pool[Math.floor(Math.random() * pool.length)]!;

  showBark(scene, citA, pair[0]);
  scene.time.delayedCall(1400, () => {
    if (citB.sprite.active && !citB.asleep && citB.sprite.visible) {
      showBark(scene, citB, pair[1]);
    }
  });

  const cd = 25000 + Math.random() * 18000;
  citA.socialCd = cd;
  citB.socialCd = cd;
  citA.barkCd = Math.max(citA.barkCd, 16000);
  citB.barkCd = Math.max(citB.barkCd, 16000);
}

/**
 * Spawn ambient townsfolk that patrol / loiter. Interactive on [E].
 * Cleans up on scene shutdown.
 */
export function addHavenCitizens(scene: Phaser.Scene): void {
  if (!scene.textures.exists(COMBAT_ATLAS_KEY)) return;

  const citizens: AmbientCitizen[] = [];
  const atlas = scene.textures.get(COMBAT_ATLAS_KEY);

  for (let i = 0; i < ALL_CITIZEN_DEFS.length; i++) {
    const def = ALL_CITIZEN_DEFS[i]!;
    const nightRole = havenAmbientNightRole(i);
    if (!def.courtyardRole && !shouldSpawnAmbientCitizen(i, Boolean(def.nightPatrolOnly), getGraphicsProfile().citizenStride)) {
      continue;
    }
    const placement = ambientPlacement(scene, def, i);
    if (!placement) continue;
    const expanded = ambientPatrolPlacement(scene, def, i, placement.path);
    const path = expanded.path;
    const workPt = placement.post;
    const sleepPt = placement.indoor;
    const appearance=residentAppearance(i);
    const gender=appearance.gender;
    const frame = lookFrame(def.look, gender);
    if (!atlas.has(frame)) continue;

    const individual=registerCitizenSprite(scene,residentIdentity(i),frame,appearance);
    const prefix=individual.prefix;
    const district = resolveCitizenDistrictNpcId(def, i);
    const spr = scene.add
      .sprite(workPt.x, workPt.y, individual.texture, individual.frame)
      .setDepth(entityDepth(workPt.y));
    setupSpriteDisplay(spr, def.scale ?? 0.88 + (i % 5) * 0.02);
    applyLight2DPipeline(spr);
    spr.setData('citizenIdentity',residentIdentity(i));
    if (def.nightPatrolOnly) {
      spr.setVisible(false);
      spr.setAlpha(0);
    }
    // Сидящие — слегка «осаживаем» спрайт
    if (expanded.sitter) {
      spr.setScale(spr.scaleX * 1.04, spr.scaleY * 0.86);
      // A seated silhouette changes display origin, never its collision anchor.
      spr.setOrigin(spr.originX, spr.originY - 5 / spr.displayHeight);
    }
    attachEntityShadow(scene, spr, 20, 8, 0.22);

    citizens.push({
      sprite: spr,
      path,
      seg: 0,
      speed: expanded.speed,
      pauseMs: expanded.pauseMs,
      wait: (i * 170) % 1800,
      bobPhase: i * 0.7,
      walkPhase: 0,
      animable: true,
      racePrefix: prefix,
      bark: nightRole === 'guard' ? undefined : pickBark(def),
      barkCd: 2800 + (i * 900) % 7000,
      greetCd: 0,
      mountYieldCd: 0,
      socialCd: 6000 + (i * 1400) % 18000,
      districtNpcId: district.npcId,
      districtLabel: district.label,
      isTalkingToPlayer: false,
      dayRoaming:false,
      asleep: false,
      sleepX: sleepPt.x,
      sleepY: sleepPt.y,
      postX: workPt.x,
      postY: workPt.y,
      nightPatrolOnly: Boolean(def.nightPatrolOnly),
      nightRole,
      courtyardRole: def.courtyardRole,
      activity:def.activity,
      baseScale: Math.abs(spr.scaleX),
      slotIndex: i,
      schedKey: '',
      route: null,
      routeSeg: 0,
      routeKey: '',
      routeRevision:-1,
      routeTarget: null,
      routeRetryMs: 0,
      sitter: expanded.sitter,
      lookCd: 2000 + (i * 700) % 5000,
      stuckMs: 0,
      repathCount: 0,
      wasCulled: false,
      lane: havenActorLane(i),
      homeTransition: 'none',
      homeTransitionT: 0,
      homeStartX: workPt.x,
      homeStartY: workPt.y,
    });
  }

  const crowd = cityCrowd(scene);
  const unregisterCrowd = citizens.map(cit => {
    const id = `resident:${cit.slotIndex}`;
    const release = crowd.register(id,()=>({x:cit.sprite.x,y:cit.sprite.y,
      active:cit.sprite.active&&cit.sprite.visible&&!cit.asleep&&cit.homeTransition==='none',
      radius:cit.courtyardRole==='child'?8:12}));
    cit.constrainStep = (from,desired)=>crowd.step(id,from,desired,scene.game.loop.frame,
      p=>!isTileBlockedAt(scene,p.x,p.y)&&!isInsidePropAabb(scene,p.x,p.y,13));
    return release;
  });

  let lastRestSnap: boolean | null = null;
  let joinSeedServerAt: number | null = null;
  let joinReseedPending = true;
  const snapAllCitizens = (force: boolean) => {
    const sched = getHavenSchedule();
    if (!sched) return;
    for (const cit of citizens) {
      const entry = sched.ambient[cit.slotIndex];
      if (entry) snapCitizenToSchedule(cit, entry, { force, serverAt: sched.serverAt });
    }
    if (force) joinSeedServerAt = sched.serverAt;
    lastRestSnap = sched.restActive;
  };
  snapAllCitizens(true);
  const unsubSchedule = subscribeHavenSchedule(() => {
    const sched = getHavenSchedule();
    if (!sched) return;
    if (shouldReseedAmbientJoinFromSchedule(joinReseedPending, joinSeedServerAt, sched.serverAt)) {
      // Bootstrap may be stale/cached; reseed once on first newer WS tick.
      snapAllCitizens(true);
      joinReseedPending = false;
      return;
    }
    if (joinReseedPending) {
      // Same snapshot as initial seed — wait for next authoritative update.
      return;
    }
    if (lastRestSnap === null) {
      snapAllCitizens(true);
      return;
    }
    // Full snap only when day↔night flips — routine ticks use the update loop.
    if (lastRestSnap !== sched.restActive) {
      snapAllCitizens(false);
    }
  });

  const promptLabel = scene.add
    .text(0, 0, '', {
      color: '#ffe080',
      fontSize: '11px',
      fontStyle: 'bold',
      backgroundColor: '#000000cc',
      padding: { x: 5, y: 2 },
    })
    .setOrigin(0.5)
    .setDepth(10_000)
    .setVisible(false);

  let talkingCitizenSlot: number | null = null;
  const courtChildren = citizens.filter(cit => cit.courtyardRole === 'child');
  scene.data.set(COURT_PLAYERS_KEY, () => courtChildren
    .filter(cit => cit.dayRoaming && !cit.asleep && cit.sprite.active && cit.sprite.visible && cit.homeTransition === 'none')
    .map(cit => ({ x: cit.sprite.x, y: cit.sprite.y })));

  const nightGuardLightBuffer: Array<{ x: number; y: number }> = [];
  const nightGuardLightPool = citizens
    .filter((cit) => cit.nightRole === 'guard')
    .map(() => ({ x: 0, y: 0 }));
  scene.data.set(NIGHT_GUARD_LIGHTS_KEY, () => {
    nightGuardLightBuffer.length = 0;
    let lightIndex = 0;
    for (const cit of citizens) {
      if (
        cit.nightRole === 'guard' &&
        cit.sprite.active &&
        cit.sprite.visible &&
        !cit.asleep &&
        cit.homeTransition === 'none' &&
        cit.sprite.alpha > 0.5
      ) {
        const point = nightGuardLightPool[lightIndex++];
        if (!point) break;
        point.x = cit.sprite.x;
        point.y = cit.sprite.y;
        nightGuardLightBuffer.push(point);
      }
    }
    return nightGuardLightBuffer;
  });

  const talkSelection = new CitizenTalkSelection();
  const visibleForInteraction: InteractionVisibility = (x, y) => {
    const visible = scene.data.get(PLAYER_INTERACTION_LOS_KEY) as InteractionVisibility | undefined;
    return visible?.(x, y) ?? true;
  };
  scene.registry.set('findNearbyTalkCitizen', (px: number, py: number, range = 72) => {
    const best = talkSelection.select(citizens, { x: px, y: py }, range, visibleForInteraction);
    return best ? { npcId: best.districtNpcId, label: best.districtLabel, slotIndex: best.slotIndex } : null;
  });

  scene.registry.set('getTalkingCitizenPortrait',(npcId:string)=>{
    const selected=citizens.find(c=>c.slotIndex===talkingCitizenSlot&&c.districtNpcId===npcId);
    return selected?residentPortraitId(selected.slotIndex):null;
  });
  scene.registry.set('setTalkingCitizen', (slotIndexOrNpcId: number | string | null) => {
    const bySlot = (slot: number): AmbientCitizen | undefined =>
      citizens.find((c) => c.slotIndex === slot);
    if (talkingCitizenSlot != null) {
      const prev = bySlot(talkingCitizenSlot);
      if (prev) prev.isTalkingToPlayer = false;
      talkingCitizenSlot = null;
    }
    if (slotIndexOrNpcId == null) {
      return;
    }
    const getPlayer = scene.data.get(PLAYER_XY_KEY) as PlayerXYFn | undefined;
    const player = getPlayer?.();
    if (!player) return;
    const target = talkSelection.resolve(citizens, slotIndexOrNpcId, player, visibleForInteraction);
    if (target) {
      talkingCitizenSlot = target.slotIndex;
      target.isTalkingToPlayer = true;
    }
  });

  // Куры у полей
  const chickens: Array<{ g: Phaser.GameObjects.Container; homeX: number; homeY: number; t: number }> = [];
  if (getGraphicsProfile().ambientCritters) {
    for (const [tx, ty] of [
      [21, 53],
      [23, 54],
      [25, 53],
      [27, 54],
      [19, 53],
    ] as const) {
      const p = nudgePointFromPropColliders(scene, c(tx, ty).x, c(tx, ty).y, 10);
      const body = scene.add.ellipse(0, 0, 10, 8, 0xf0e0c0, 1);
      const comb = scene.add.circle(3, -3, 2, 0xcc3344, 1);
      const g = scene.add.container(p.x, p.y, [body, comb]).setDepth(entityDepth(p.y));
      chickens.push({ g, homeX: p.x, homeY: p.y, t: Math.random() * Math.PI * 2 });
    }
  }

  // Коты у трактира и порта
  const cats: Array<{ g: Phaser.GameObjects.Container; homeX: number; homeY: number; t: number }> = [];
  if (getGraphicsProfile().ambientCritters) {
    for (const [tx, ty, color] of [
      [57, 18, 0x4a4038],
      [59, 19, 0xc8b090],
      [62, 52, 0x2a2824],
      [70, 56, 0x8a7060],
      [14, 18, 0x5a5048],
    ] as const) {
      const p = nudgePointFromPropColliders(scene, c(tx, ty).x, c(tx, ty).y, 10);
      const body = scene.add.ellipse(0, 1, 12, 7, color, 1);
      const head = scene.add.circle(5, -2, 4, color, 1);
      const ear1 = scene.add.triangle(3, -6, 0, 4, 3, 0, 6, 4, 0x2a2018, 1);
      const ear2 = scene.add.triangle(7, -6, 0, 4, 3, 0, 6, 4, 0x2a2018, 1);
      const g = scene.add.container(p.x, p.y, [body, head, ear1, ear2]).setDepth(entityDepth(p.y));
      cats.push({ g, homeX: p.x, homeY: p.y, t: Math.random() * Math.PI * 2 });
    }
  }

  const actorClock=new CityUpdateClock();
  let debugElapsedMs=0;
  const debugEnabled=citizenLifeDebugEnabled();
  let accDeltaMs = 0;
  const onUpdate = (_time: number, delta: number) => {
    accDeltaMs = Math.min(500,accDeltaMs+Math.max(0,delta));
    const uiBlocked = Boolean(scene.registry.get('uiBlocked'));
    const minStepMs = uiBlocked ? 200 : 32;
    if (accDeltaMs < minStepMs) return;
    const elapsedMs = accDeltaMs;
    accDeltaMs = 0;
    const dt = Math.min(0.25, elapsedMs / 1000);
    debugElapsedMs+=elapsedMs;
    const getPlayer = scene.data.get(PLAYER_XY_KEY) as PlayerXYFn | undefined;
    const player = getPlayer?.() ?? null;
    const isMountedFn = scene.data.get('isPlayerMounted') as (() => boolean) | undefined;
    const isPlayerMounted = Boolean(isMountedFn?.());
    const getSaveFn = scene.data.get('getPlayerSave') as (() => { karma?: number } | undefined) | undefined;
    const playerKarma = getSaveFn?.()?.karma;
    const daySnap = scene.registry.get('dayNightSnapshot') as { hour?: number } | undefined;
    const worldHour = daySnap?.hour;
    const cam = scene.cameras.main;
    const view = cam.worldView;
    // Pad / far radius scale with viewport so ultrawide doesn't show pop-in at edges.
    // (Old fixed 140px pad + 780px player-radius hid on-screen NPCs on large monitors.)
    const pad = Math.max(280, Math.round(Math.max(view.width, view.height) * 0.15));
    const viewL = view.x - pad;
    const viewR = view.right + pad;
    const viewT = view.y - pad;
    const viewB = view.bottom + pad;
    const viewReach = Math.hypot(view.width * 0.5, view.height * 0.5) + pad;
    const farDist = Math.max(1100, viewReach + 240);
    const FAR_SQ = farDist * farDist;
    const sched =
      (scene.registry.get('havenSchedule') as ReturnType<typeof getHavenSchedule> | undefined) ??
      getHavenSchedule();
    const atRest = sched?.restActive ?? false;
    let nearestCitForPrompt: AmbientCitizen | null = null;
    let nearestPromptD2 = 72 * 72;

    const gfx = getGraphicsProfile();
    const socialNeighbors = new SpatialNeighbors(
      citizens.filter(cit => cit.sprite.active && cit.sprite.visible && !cit.asleep && !cit.sitter)
        .map(cit => ({ x: cit.sprite.x, y: cit.sprite.y, cit })),
      64,
    );
    for (const cit of citizens) {
      const spr = cit.sprite;
      if (!spr.active) continue;
      cit.socialWaitMs=Math.max(0,(cit.socialWaitMs??0)-elapsedMs);
      cit.greetHoldMs=Math.max(0,(cit.greetHoldMs??0)-elapsedMs);

      const entry = sched?.ambient[cit.slotIndex];
      const strictAtPost = Boolean(entry && entry.phase === 'at_post' && !cit.dayRoaming && !cit.nightPatrolOnly);
      const asleepOrHidden =
        Boolean(entry) &&
        (entry!.phase === 'hidden' ||
          ((entry!.phase === 'at_home' ||
          (entry!.asleep && entry!.phase !== 'walking_to_post' && !cit.nightPatrolOnly)) && cit.asleep && cit.homeTransition === 'none'));

      if (asleepOrHidden) {
        actorClock.take(cit,elapsedMs,0);
        if (entry) applyCitizenSchedule(cit, entry, dt, { collide: false });
        continue;
      }

      const onScreen =
        spr.x >= viewL && spr.x <= viewR && spr.y >= viewT && spr.y <= viewB;
      const d2 = player
        ? (player.x - spr.x) * (player.x - spr.x) + (player.y - spr.y) * (player.y - spr.y)
        : 0;
      const far = Boolean(player) && !cit.nightPatrolOnly && d2 > FAR_SQ;

      if (cit.isTalkingToPlayer) {
        actorClock.take(cit,elapsedMs,0);
        if (player) {
          faceCitizenToward(cit,player);
        }
        clearStreetRoute(cit);
        tickCitizenWalkAnim(cit, dt, false);
        spr.setDepth(entityDepth(spr.y));
        syncEntityShadow(spr);
        continue;
      }

      // Only hide when off-camera. Distance cull used to hide NPCs still inside a wide view.
      if (!onScreen) {
        syncEntityShadow(spr);
        // Each actor keeps the time accumulated while its cheaper update is deferred.
        const accumulated=actorClock.take(cit,elapsedMs,far?500:200);
        if(accumulated==null)continue;
        const stepDt=accumulated/1000;
        if (entry && applyCitizenSchedule(cit, entry, stepDt, { collide: true })) continue;
        if (!cit.sitter && cit.path.length >= 2 && cit.speed > 0) {
          walkPatrolSegment(cit, stepDt, true);
        }
        continue;
      }

      const citizenElapsedMs=actorClock.take(cit,elapsedMs,0)??elapsedMs;
      const citizenDt=Math.min(0.5,citizenElapsedMs/1000);
      if (!spr.visible && spr.alpha > 0.05) spr.setVisible(true);

      if (entry && applyCitizenSchedule(cit, entry, citizenDt, { collide: true })) {
        // Commute used to early-out with zero idle/walk ticks → "вкопаные" on screen.
        if (spr.visible && !cit.asleep && spr.alpha > 0.05 && cit.homeTransition === 'none') {
          cit.bobPhase += citizenDt * 2.4;
          const moving = Boolean(cit.route?.length) && cit.routeRetryMs === 0 && cit.stuckMs === 0 && cit.homeTransition === 'none';
          if (!moving) tickCitizenWalkAnim(cit, citizenDt, false);
          cit.lookCd -= citizenElapsedMs;
          spr.setDepth(entityDepth(spr.y));
          syncEntityShadow(spr);
        }
        continue;
      }

      if(cit.yieldTarget){
        if(walkCitizen(cit,citizenDt,cit.yieldTarget.x,cit.yieldTarget.y,36)||cit.stuckMs>=STUCK_REPATH_MS)cit.yieldTarget=null;
        continue;
      }

      if (player && onScreen && !cit.asleep && spr.visible && spr.alpha > 0.5 && cit.homeTransition === 'none') {
        const pdist2 = (player.x - spr.x) * (player.x - spr.x) + (player.y - spr.y) * (player.y - spr.y);
        if (pdist2 < nearestPromptD2 && visibleForInteraction(spr.x, spr.y)) {
          nearestPromptD2 = pdist2;
          nearestCitForPrompt = cit;
        }
      }

      cit.bobPhase += citizenDt * 2.4;
      cit.barkCd -= citizenElapsedMs;
      cit.greetCd -= citizenElapsedMs;
      cit.mountYieldCd -= citizenElapsedMs;
      cit.socialCd -= citizenElapsedMs;
      cit.lookCd -= citizenElapsedMs;

      let pauseForPlayer = false;
      if (player && !strictAtPost && cit.courtyardRole !== 'child') {
        const pdx = player.x - spr.x;
        const pdy = player.y - spr.y;
        const pdist = Math.hypot(pdx, pdy);
        const greetRange = cit.nightRole === 'guard' ? 64 : 52;
        if (pdist < greetRange && (cit.greetCd<=0 || (cit.greetHoldMs??0)>0)) {
          pauseForPlayer = true;
          faceCitizenToward(cit,player);
          tickCitizenWalkAnim(cit, citizenDt, false);

          // Lateral sidewalk evasion for mounted player
          if (
            isPlayerMounted &&
            pdist < 56 &&
            cit.mountYieldCd <= 0 &&
            cit.homeTransition === 'none' &&
            !cit.sitter
          ) {
            const candidates = mountedYieldCandidates(
              { x: spr.x, y: spr.y },
              { x: pdx, y: pdy },
              cit.lane,
            );
            for (const candidate of candidates) {
              const safe = nudgePointFromPropColliders(scene, candidate.x, candidate.y, 14);
              if (
                !isInsidePropAabb(scene, safe.x, safe.y, 12) &&
                !isTileBlockedAt(scene, safe.x, safe.y) &&
                Math.hypot(safe.x - spr.x, safe.y - spr.y) >= 6
              ) {
                cit.yieldTarget={x:safe.x,y:safe.y};
                break;
              }
            }
            cit.mountYieldCd = 900;
            cit.wait = Math.max(cit.wait, 1200);
          }

          if (cit.greetCd <= 0) {
            cit.greetHoldMs=1200;
            const line = pickContextualGreetingBark({
              districtNpcId: cit.districtNpcId,
              isNightGuard: cit.nightRole === 'guard',
              hour: worldHour,
              playerMounted: isPlayerMounted,
              playerKarma,
            });
            showBark(scene, cit, line);
            cit.greetCd = cit.nightRole === 'guard'
              ? 9000 + Math.random() * 4000
              : 14000 + Math.random() * 6000;
            cit.barkCd = Math.max(cit.barkCd, 5000);
          }
        }
      }

      if (!pauseForPlayer && cit.bark && cit.barkCd <= 0) {
        showBark(scene, cit, cit.bark);
        cit.barkCd = cit.nightRole === 'guard'
          ? 7000 + Math.random() * 5000
          : 10000 + Math.random() * 8000;
      }
      if (cit.bubble?.active) {
        cit.bubble.setPosition(spr.x, spr.y - 36);
        cit.bubble.setDepth(spr.depth + 2);
      }

      if (
        !strictAtPost &&
        !pauseForPlayer &&
        gfx.citizenSocial &&
        cit.socialCd <= 0 &&
        onScreen &&
        !cit.asleep &&
        !cit.sitter &&
        !cit.isTalkingToPlayer &&
        cit.homeTransition === 'none' &&
        entry?.phase === 'at_post'
      ) {
        for (const neighbor of socialNeighbors.nearby({ x: spr.x, y: spr.y, cit }, 64)) {
          const other = neighbor.cit;
          if (other.slotIndex <= cit.slotIndex) continue;
          if (
            other.socialCd <= 0 &&
            other.sprite.active &&
            other.sprite.visible &&
            !other.asleep &&
            !other.sitter &&
            !other.isTalkingToPlayer &&
            other.homeTransition === 'none' &&
            sched?.ambient[other.slotIndex]?.phase === 'at_post' &&
            Math.hypot(other.sprite.x - spr.x, other.sprite.y - spr.y) < 48
          ) {
            triggerCitizenSocialChat(scene, cit, other);
            break;
          }
        }
      }

      if (pauseForPlayer) {
        spr.setDepth(entityDepth(spr.y));
        syncEntityShadow(spr);
        continue;
      }

      if (cit.sitter || cit.path.length < 2 || cit.speed <= 0 || cit.wait > 0) {
        if(cit.wait>0)cit.wait=Math.max(0,cit.wait-citizenElapsedMs);
        // Social conversations retain their facing; object activities use an authored target.
        if(!cit.socialWaitMs)applyCitizenActivity(cit,cit.activity);
        tickCitizenWalkAnim(cit,citizenDt,false);
        spr.setDepth(entityDepth(spr.y));
        syncEntityShadow(spr);
        continue;
      }

      walkPatrolSegment(cit, citizenDt, true);
      spr.setDepth(entityDepth(spr.y));
      syncEntityShadow(spr);
    }

    for (const ch of chickens) {
      if (atRest) {
        ch.g.setVisible(false);
        continue;
      }
      ch.g.setVisible(true);
      ch.t += dt * 1.6;
      const ox = ch.homeX + Math.sin(ch.t) * 18 + Math.cos(ch.t * 0.7) * 8;
      const oy = ch.homeY + Math.cos(ch.t * 1.1) * 12;
      if (!isTileBlockedAt(scene, ox, oy) && !isInsidePropAabb(scene, ox, oy, 6)) ch.g.setPosition(ox, oy);
      ch.g.setDepth(entityDepth(ch.g.y));
      ch.g.setScale(Math.sin(ch.t * 2) > 0 ? 1 : -1, 1);
    }

    for (const cat of cats) {
      if (atRest) {
        cat.g.setVisible(false);
        continue;
      }
      cat.g.setVisible(true);
      cat.t += dt * 0.9;
      const ox = cat.homeX + Math.sin(cat.t * 0.8) * 22 + Math.cos(cat.t * 0.5) * 10;
      const oy = cat.homeY + Math.cos(cat.t * 0.9) * 10;
      if (!isTileBlockedAt(scene, ox, oy) && !isInsidePropAabb(scene, ox, oy, 6)) cat.g.setPosition(ox, oy);
      cat.g.setDepth(entityDepth(cat.g.y));
      cat.g.setScale(Math.sin(cat.t) > 0 ? 1 : -1, 1);
    }

    if (nearestCitForPrompt && !uiBlocked) {
      promptLabel.setText(`${nearestCitForPrompt.districtLabel} [E]`);
      promptLabel.setPosition(nearestCitForPrompt.sprite.x, nearestCitForPrompt.sprite.y - 38);
      promptLabel.setDepth(entityDepth(nearestCitForPrompt.sprite.y) + 30);
      promptLabel.setVisible(true);
    } else {
      promptLabel.setVisible(false);
    }

    if(debugEnabled&&debugElapsedMs>=1000){
      debugElapsedMs%=1000;
      scene.game.canvas.dataset.havenCitizens=JSON.stringify({
        total:citizens.length,visible:citizens.filter(cit=>cit.sprite.visible&&!cit.asleep).length,
        roaming:citizens.filter(cit=>cit.dayRoaming).length,
        moving:citizens.filter(cit=>Boolean(cit.route?.length)&&!cit.asleep&&cit.stuckMs===0).length,
        blocked:citizens.filter(cit=>cit.stuckMs>0).length,asleep:citizens.filter(cit=>cit.asleep).length,
      });
      const fingerprints=scene.data.get('citizenAppearanceFingerprints') as Map<string,number>|undefined;
      scene.game.canvas.dataset.citizenLooks=JSON.stringify([...(fingerprints??new Map())]);
      const actors=scene.children.list.filter((go):go is Phaser.GameObjects.Sprite =>
        go instanceof Phaser.GameObjects.Sprite && go.active && go.visible && go.alpha>=0.999 && (go.texture.key===COMBAT_ATLAS_KEY||go.texture.key.startsWith('individual-')))
        .map(go=>({x:go.x,y:go.y,frame:go.frame.name,blocked:isInsidePropAabb(scene,go.x,go.y,13)||isTileBlockedAt(scene,go.x,go.y)}));
      scene.game.canvas.dataset.havenGeometry=JSON.stringify({restActive:atRest,revision:propCollisionRevision(scene),boxes:propCollisionAudit(scene),actors});
    }
  };

  scene.events.on('update', onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off('update', onUpdate);
    for(const release of unregisterCrowd) release();
    if(debugEnabled){delete scene.game.canvas.dataset.havenCitizens;delete scene.game.canvas.dataset.havenGeometry;delete scene.game.canvas.dataset.citizenLooks;}
    unsubSchedule();
    clearNpcRouteCache(scene);
    promptLabel.destroy();
    scene.data.remove(NIGHT_GUARD_LIGHTS_KEY);
    scene.data.remove(COURT_PLAYERS_KEY);
    scene.registry.remove('findNearbyTalkCitizen');
    scene.registry.remove('setTalkingCitizen');
    scene.registry.remove('getTalkingCitizenPortrait');
    for (const cit of citizens) {
      cit.bubble?.destroy();
      cit.sprite.destroy();
    }
    for (const ch of chickens) ch.g.destroy();
    for (const cat of cats) cat.g.destroy();
    citizens.length = 0;
    chickens.length = 0;
    cats.length = 0;
  });
}
