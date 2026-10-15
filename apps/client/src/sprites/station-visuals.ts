import { stationPropSpec, type StationKind } from '@empery/shared';
import { addPropFootprint } from './prop-colliders.js';
import Phaser from 'phaser';
import type { LocationConfig } from '../game/scenes/location-types.js';
import { placeWorldProp } from './place-world-prop.js';


interface StationVisualSpec {
  assetId: string;
  size: number;
  /** Procedural fallback if PNG missing. */
  fallback?: (scene: Phaser.Scene, x: number, y: number) => void;
}

const FALLBACKS: Record<StationKind,(scene:Phaser.Scene,x:number,y:number)=>void> = {
  water:drawWellFallback,campfire:drawCampfireFallback,hearth:drawHearthFallback,pot:drawCookpotFallback,
};

function drawWellFallback(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(6);
  g.fillStyle(0x5a5a58, 1);
  g.fillCircle(x, y, 22);
  g.fillStyle(0x2a4058, 1);
  g.fillCircle(x, y, 14);
  g.fillStyle(0x6a5030, 1);
  g.fillRect(x - 18, y - 28, 36, 8);
  g.fillRect(x - 3, y - 36, 6, 12);
}

function drawCampfireFallback(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(6);
  g.fillStyle(0x444444, 1);
  g.fillCircle(x, y + 8, 14);
  g.fillStyle(0xff6622, 0.85);
  g.fillTriangle(x - 8, y + 8, x + 8, y + 8, x, y - 10);
  g.fillStyle(0xffaa44, 0.75);
  g.fillCircle(x, y, 6);
}

function drawHearthFallback(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(6);
  g.fillStyle(0x6a6058, 1);
  g.fillRoundedRect(x - 28, y - 16, 56, 40, 4);
  g.fillStyle(0x2a2018, 1);
  g.fillRect(x - 14, y - 4, 28, 18);
  g.fillStyle(0xff7722, 0.85);
  g.fillCircle(x, y + 4, 8);
  g.fillStyle(0xffcc66, 0.7);
  g.fillCircle(x, y + 2, 4);
}

function drawCookpotFallback(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(7);
  g.fillStyle(0x3a3a40, 1);
  g.fillEllipse(x, y, 22, 16);
  g.fillStyle(0x2a2a30, 1);
  g.fillEllipse(x, y - 2, 14, 8);
}

function drawBasinFallback(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(6);
  g.fillStyle(0x8a8a88, 1);
  g.fillRoundedRect(x - 18, y - 12, 36, 28, 4);
  g.fillStyle(0x4a7090, 1);
  g.fillEllipse(x, y, 20, 12);
}

function placeSpec(scene: Phaser.Scene, x: number, y: number, spec: StationVisualSpec): void {
  if (placeWorldProp(scene, spec.assetId, x, y, spec.size)) return;
  spec.fallback?.(scene, x, y);
  addPropFootprint(scene,spec.assetId,x,y,spec.size);
}

/**
 * Place a world prop (or procedural fallback) on every survival station that
 * would otherwise be an invisible [E] hotspot.
 */
export function addStationVisuals(scene: Phaser.Scene, location: LocationConfig): void {
  const stations = location.stations ?? [];
  if (!stations.length) return;

  for (const station of stations) {
    const descriptor = stationPropSpec(location.id, station, stations);
    if (!descriptor) continue;
    const fallback=location.id==='haven_apartment'&&station.kind==='water'?drawBasinFallback:FALLBACKS[station.kind as StationKind];
    const spec={...descriptor,fallback};

    placeSpec(scene, station.x, station.y, spec);
  }
}
