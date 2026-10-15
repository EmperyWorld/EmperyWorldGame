/**
 * Haven land gates open by day and seal at night (restActive).
 * Mirrors HQ closed/open asset swap + collider refresh.
 */
import type Phaser from 'phaser';
import { getHavenSchedule, subscribeHavenSchedule } from '../world-clock.js';
import {
  cityGateClosedAssetId,
  cityGateOpenAssetId,
  isCityGateAsset,
  refreshCityGateFootprint,
} from './prop-colliders.js';
import { resolvePropDepth } from './place-world-prop.js';
import { hasPropTexture, propTextureKey, WORLD_MEDIA_ATLAS_KEY } from './texture-loader.js';

export type HavenGateHandle = {
  closedId: string;
  x: number;
  y: number;
  size: number;
  image: Phaser.GameObjects.Image;
};

const GATES_KEY = 'havenCityGates';

function gatesWantOpen(): boolean {
  const sched = getHavenSchedule();
  // No schedule yet → treat as day (open) so travel works offline.
  if (!sched) return true;
  return !sched.restActive;
}

function resolveVisualId(scene: Phaser.Scene, closedId: string, open: boolean): string {
  if (!open) return closedId;
  const openId = cityGateOpenAssetId(closedId);
  return hasPropTexture(scene, openId) ? openId : closedId;
}

function applyGateVisual(scene: Phaser.Scene, gate: HavenGateHandle, open: boolean): void {
  const nextId = resolveVisualId(scene, gate.closedId, open);
  const frame = propTextureKey(nextId);
  if (gate.image.frame?.name !== frame) {
    if (scene.textures.exists(WORLD_MEDIA_ATLAS_KEY) && scene.textures.get(WORLD_MEDIA_ATLAS_KEY).has(frame)) {
      gate.image.setTexture(WORLD_MEDIA_ATLAS_KEY, frame);
    } else if (scene.textures.exists(frame)) {
      gate.image.setTexture(frame);
    }
  }
  gate.image.setDepth(resolvePropDepth(scene, nextId, gate.y, gate.size));
  refreshCityGateFootprint(scene, open?cityGateOpenAssetId(gate.closedId):gate.closedId, gate.x, gate.y, gate.size);
}

/** Register a land city gate for day/night open-close (skip harbor arch). */
export function registerHavenCityGate(
  scene: Phaser.Scene,
  assetId: string,
  image: Phaser.GameObjects.Image,
  x: number,
  y: number,
  size: number,
): void {
  if (!isCityGateAsset(assetId)) return;
  if (assetId === 'prop_harbor_guard_arch') return;
  const closedId = cityGateClosedAssetId(assetId);
  if (
    closedId !== 'prop_city_gate' &&
    closedId !== 'prop_city_gate_s' &&
    closedId !== 'prop_city_gate_e'
  ) {
    return;
  }
  const list = (scene.data.get(GATES_KEY) as HavenGateHandle[] | undefined) ?? [];
  list.push({ closedId, x, y, size, image });
  scene.data.set(GATES_KEY, list);
}

export function bindHavenCityGates(scene: Phaser.Scene): () => void {
  const applied=new WeakMap<Phaser.GameObjects.Image,boolean>();
  const apply = (): void => {
    const open = gatesWantOpen();
    const list = scene.data.get(GATES_KEY) as HavenGateHandle[] | undefined;
    if (!list?.length) return;
    for (const gate of list) {
      if (!gate.image.active||applied.get(gate.image)===open) continue;
      applied.set(gate.image,open);
      applyGateVisual(scene, gate, open);
    }
  };
  apply();
  return subscribeHavenSchedule(apply);
}
