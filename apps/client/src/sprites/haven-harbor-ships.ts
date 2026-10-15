/**
 * Haven harbor fleet: one hull per type, berth schedule, outbound/return routes.
 * Heading art is swapped from velocity while underway (unique viewpoint, no flip).
 */
import type Phaser from 'phaser';
import {
  absoluteGameHours,
  havenHarborPatrolWorld,
  havenShipBerthHeading,
  havenShipHeadingFromDelta,
  parseHavenShipAsset,
  pointAlongWorldPath,
  resolveHavenShipVisualId,
  resolveHavenShipVoyage,
  type DayNightSnapshot,
  type HavenShipHeading,
  type HavenShipVoyageState,
} from '@empery/shared';
import { loopDecorCounter } from './decor-fx.js';
import { hasPropTexture, hasWorldMediaFrame, propTextureKey, WORLD_MEDIA_ATLAS_KEY } from './texture-loader.js';
import { getWorldClock, subscribeHavenSchedule } from '../world-clock.js';

export type HarborShipHandle = {
  image: Phaser.GameObjects.Image;
  assetId: string;
  homeX: number;
  homeY: number;
};

function hullIdOf(assetId: string): string {
  return parseHavenShipAsset(assetId)?.hullId ?? assetId;
}

function applyShipHeading(
  scene: Phaser.Scene,
  ship: Phaser.GameObjects.Image,
  hullId: string,
  heading: HavenShipHeading,
): string {
  const visualId = resolveHavenShipVisualId(hullId, heading, (id) => hasPropTexture(scene, id));
  const frame = propTextureKey(visualId);
  const w = ship.displayWidth;
  const h = ship.displayHeight;
  if (hasWorldMediaFrame(scene, frame)) {
    if (ship.texture.key !== WORLD_MEDIA_ATLAS_KEY || ship.frame.name !== frame) {
      ship.setTexture(WORLD_MEDIA_ATLAS_KEY, frame);
    }
  } else if (scene.textures.exists(frame) && ship.texture.key !== frame) {
    ship.setTexture(frame);
  }
  ship.setDisplaySize(w, h);
  ship.setData('havenShipHeading', heading);
  ship.setData('havenShipVisualId', visualId);
  return visualId;
}

function absHoursFromClock(clock: DayNightSnapshot | null): number {
  if (!clock) return 12;
  return absoluteGameHours(clock.serverAt, clock.cycleMs, clock.epochMs);
}

function poseAlongOutbound(
  outbound: ReadonlyArray<{ x: number; y: number }>,
  state: HavenShipVoyageState,
  routeT: number,
): { x: number; y: number; heading: HavenShipHeading } {
  const t = state === 'returning' ? 1 - routeT : routeT;
  const pos = pointAlongWorldPath(outbound, t);
  const look = pointAlongWorldPath(outbound, Math.min(1, t + 0.04));
  const back = pointAlongWorldPath(outbound, Math.max(0, t - 0.04));
  const dx = look.x - back.x;
  const dy = look.y - back.y;
  const heading =
    state === 'returning'
      ? havenShipHeadingFromDelta(back.x - look.x, back.y - look.y)
      : havenShipHeadingFromDelta(dx, dy);
  return { x: pos.x, y: pos.y, heading };
}

/** Bob berthed boats; follow each ship's outbound/return route from game time. */
export function bindHavenHarborShips(
  scene: Phaser.Scene,
  ships: readonly HarborShipHandle[],
): void {
  if (ships.length === 0) return;

  const harbor = window as Window & {
    __EMPERY_HARBOR__?: Record<string, unknown>;
  };

  const ripples = scene.add.graphics().setDepth(3);
  const drawRipples = (phase: number): void => {
    ripples.clear();
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i]!.image;
      if (!ship.active || !ship.visible) continue;
      const pulse = 0.55 + 0.45 * Math.sin(phase * 2 + i * 1.3);
      const hull = Math.max(90, ship.displayWidth || 140);
      ripples.lineStyle(2, 0xc8e0f0, 0.22 * pulse);
      ripples.strokeEllipse(ship.x, ship.y + 22, hull * 0.7 + pulse * 16, 18 + pulse * 5);
      ripples.lineStyle(1.2, 0xa8d0e8, 0.12 * pulse);
      ripples.strokeEllipse(ship.x, ship.y + 28, hull * 0.95 + pulse * 20, 26);
    }
  };
  drawRipples(0);
  loopDecorCounter(scene, {
    from: 0,
    to: Math.PI * 2,
    duration: 2800,
    repeat: -1,
    onUpdate: (tw) => drawRipples(tw.getValue() ?? 0),
  });

  const bobTweens: Phaser.Tweens.Tween[] = [];
  for (let i = 0; i < ships.length; i++) {
    const handle = ships[i]!;
    const ship = handle.image;
    const hullId = hullIdOf(handle.assetId);
    applyShipHeading(scene, ship, hullId, havenShipBerthHeading(handle.homeX, handle.homeY));
    const bob = scene.tweens.add({
      targets: ship,
      angle: { from: -1.4, to: 1.4 },
      duration: 2800 + i * 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      paused: true,
    });
    bobTweens.push(bob);
    ship.setData('havenShipHomeY', handle.homeY);
  }

  const applyVoyage = (): void => {
    const absHours = absHoursFromClock(getWorldClock());
    for (let i = 0; i < ships.length; i++) {
      const handle = ships[i]!;
      const ship = handle.image;
      if (!ship.active) continue;
      const hullId = hullIdOf(handle.assetId);
      const voyage = resolveHavenShipVoyage(hullId, absHours);
      const outbound = havenHarborPatrolWorld(handle.assetId);
      ship.setData('havenShipState', voyage.state);
      ship.setData('havenShipAbsHours', absHours);
      if (voyage.state === 'at_sea' || !outbound) {
        ship.setVisible(false);
        bobTweens[i]?.pause();
        continue;
      }
      ship.setVisible(true);
      if (voyage.state === 'in_port') {
        ship.setPosition(handle.homeX, handle.homeY);
        applyShipHeading(scene, ship, hullId, havenShipBerthHeading(handle.homeX, handle.homeY));
        if (bobTweens[i] && !bobTweens[i]!.isPlaying()) bobTweens[i]!.play();
        continue;
      }
      bobTweens[i]?.pause();
      ship.setAngle(0);
      const pose = poseAlongOutbound(outbound, voyage.state, voyage.routeT);
      ship.setPosition(pose.x, pose.y);
      applyShipHeading(scene, ship, hullId, pose.heading);
    }
  };

  applyVoyage();
  const unsub = subscribeHavenSchedule(applyVoyage);
  scene.events.on('update', applyVoyage);
  scene.events.once('shutdown', () => {
    unsub();
    scene.events.off('update', applyVoyage);
  });

  harbor.__EMPERY_HARBOR__ = {
    ...harbor.__EMPERY_HARBOR__,
    ships: () =>
      ships
        .filter((h) => h.image.active)
        .map((h) => ({
          id: h.assetId,
          visual: String(h.image.getData('havenShipVisualId') ?? h.assetId),
          heading: String(h.image.getData('havenShipHeading') ?? ''),
          state: String(h.image.getData('havenShipState') ?? ''),
          visible: h.image.visible,
          x: Math.round(h.image.x),
          y: Math.round(h.image.y),
        })),
  };
}
