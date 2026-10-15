import { propCollisionBoxes } from '@empery/shared/world-props';
import Phaser from 'phaser';
import { propColliderMode } from './prop-layer.js';
import {
  type PropFootprint,
} from './prop-footprint.js';
import {
  clearPropOpaqueCache,
  type SilhouetteColliderMode,
} from './prop-silhouette.js';
import { nudgeFromGroundTiles } from './world-tiles.js';

export type { PropFootprint };
export { footprintForProp, shouldForcePropAabb } from '@empery/shared/prop-footprint';

/** Scene data key for haven/world prop static colliders. */
export const PROP_COLLIDER_GROUP_KEY = 'propColliderGroup';
/** Optional scene diagnostics: actual Phaser bodies, including decorative modules. */
export function propCollisionAudit(scene: Phaser.Scene): Array<{ cx: number; cy: number; bw: number; bh: number }> {
  const group = scene.data.get(PROP_COLLIDER_GROUP_KEY) as Phaser.Physics.Arcade.StaticGroup | undefined;
  if (!isPropColliderGroupAlive(group)) return [];
  return group.getChildren().flatMap(child => {
    const body = (child as Phaser.GameObjects.GameObject & { body?: Phaser.Physics.Arcade.StaticBody }).body;
    return body ? [{ cx: (body.left + body.right) / 2, cy: (body.top + body.bottom) / 2, bw: body.right - body.left, bh: body.bottom - body.top }] : [];
  });
}
const PROP_DEBUG_KEY = 'propColliderDebug';

function isPropColliderGroupAlive(
  group: Phaser.Physics.Arcade.StaticGroup | undefined | null,
): group is Phaser.Physics.Arcade.StaticGroup {
  return Boolean(group && (group as { scene?: Phaser.Scene | null }).scene && group.children);
}

export function ensurePropColliderGroup(
  scene: Phaser.Scene,
): Phaser.Physics.Arcade.StaticGroup {
  const existing = scene.data.get(PROP_COLLIDER_GROUP_KEY) as
    | Phaser.Physics.Arcade.StaticGroup
    | undefined;
  // After travel, a destroyed group can linger in scene.data — never reuse it.
  if (isPropColliderGroupAlive(existing)) return existing;

  if (existing) {
    const stale = existing as Phaser.Physics.Arcade.StaticGroup;
    try {
      if (stale.children) stale.clear(true, true);
    } catch {
      /* already dead */
    }
    try {
      stale.destroy(true);
    } catch {
      /* already dead */
    }
    scene.data.remove(PROP_COLLIDER_GROUP_KEY);
  }
  const group = scene.physics.add.staticGroup();
  scene.data.set(PROP_COLLIDER_GROUP_KEY, group);
  return group;
}

function propDebugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('propDebug');
  } catch {
    return false;
  }
}

function ensureDebugGfx(scene: Phaser.Scene): Phaser.GameObjects.Graphics | null {
  if (!propDebugEnabled()) return null;
  let g = scene.data.get(PROP_DEBUG_KEY) as Phaser.GameObjects.Graphics | undefined;
  if (g) return g;
  g = scene.add.graphics().setDepth(10_000);
  scene.data.set(PROP_DEBUG_KEY, g);
  return g;
}

function debugColor(mode: SilhouetteColliderMode): number {
  if (mode === 'flat') return 0x44cc88;
  if (mode === 'trunk') return 0x88aaff;
  if (mode === 'arch') return 0xffcc44;
  if (mode === 'stall') return 0xff9944;
  return 0xff6688;
}

function addStaticBox(
  scene: Phaser.Scene,
  group: Phaser.Physics.Arcade.StaticGroup,
  cx: number,
  cy: number,
  bw: number,
  bh: number,
  mode: SilhouetteColliderMode,
  gateKey?: string,
): void {
  if (!group?.children || !isPropColliderGroupAlive(group)) return;
  const w = Math.max(12, Math.round(bw));
  const h = Math.max(12, Math.round(bh));
  // Zone: non-rendering, reliable displayWidth for Phaser 4 StaticBody sync.
  const box = scene.add.zone(cx, cy, w, h);
  box.setOrigin(0.5, 0.5);
  if (gateKey) box.setData('cityGateKey', gateKey);
  scene.physics.add.existing(box, true);
  const body = box.body as Phaser.Physics.Arcade.StaticBody | null;
  if (!body) {
    box.destroy();
    return;
  }
  try {
    group.add(box);
  } catch {
    box.destroy();
    return;
  }
  // Re-sync after group.add — Phaser 4 staticTree must match final GO bounds.
  body.updateFromGameObject();
  invalidatePropIndex(scene);

  const dbg = ensureDebugGfx(scene);
  if (dbg) {
    dbg.lineStyle(1, debugColor(mode), 0.85);
    dbg.strokeRect(cx - w / 2, cy - h / 2, w, h);
  }
}

const CITY_GATE_CLOSED_NS = new Set(['prop_city_gate', 'prop_city_gate_s']);
const CITY_GATE_OPEN_NS = new Set(['prop_city_gate_open', 'prop_city_gate_s_open']);
const CITY_GATE_E_CLOSED = 'prop_city_gate_e';
const CITY_GATE_E_OPEN = 'prop_city_gate_e_open';
const HARBOR_GUARD_ARCH = 'prop_harbor_guard_arch';

export function isCityGateAsset(assetId: string): boolean {
  return (
    CITY_GATE_CLOSED_NS.has(assetId) ||
    CITY_GATE_OPEN_NS.has(assetId) ||
    assetId === CITY_GATE_E_CLOSED ||
    assetId === CITY_GATE_E_OPEN ||
    assetId === HARBOR_GUARD_ARCH
  );
}

export function cityGateOpenAssetId(closedId: string): string {
  if (closedId === 'prop_city_gate') return 'prop_city_gate_open';
  if (closedId === 'prop_city_gate_s') return 'prop_city_gate_s_open';
  if (closedId === 'prop_city_gate_e') return 'prop_city_gate_e_open';
  return closedId;
}

export function cityGateClosedAssetId(openOrClosedId: string): string {
  if (openOrClosedId === 'prop_city_gate_open') return 'prop_city_gate';
  if (openOrClosedId === 'prop_city_gate_s_open') return 'prop_city_gate_s';
  if (openOrClosedId === 'prop_city_gate_e_open') return 'prop_city_gate_e';
  return openOrClosedId;
}

/**
 * City-gate jamb boxes. Closed seals the door leaf; open keeps a road slit.
 * Harbor guard arch is always an open span. East: N/S pillars; NS: E/W pillars.
 */
export function cityGatePillarBoxes(
  assetId: string,
  x: number,
  y: number,
  size: number,
): ReadonlyArray<{ cx: number; cy: number; bw: number; bh: number }> {
  const open =
    CITY_GATE_OPEN_NS.has(assetId) ||
    assetId === CITY_GATE_E_OPEN ||
    assetId === HARBOR_GUARD_ARCH;
  const opening = Math.max(open ? 72 : 20, Math.round(size * (open ? 0.34 : 0.08)));
  const openingHalf = opening * 0.5;
  const thick = Math.max(48, Math.round(size * (open ? 0.32 : 0.42)));
  const deep = Math.max(36, Math.round(size * 0.42));
  const east = assetId === CITY_GATE_E_CLOSED || assetId === CITY_GATE_E_OPEN;
  if (east) {
    const boxes = [
      { cx: x, cy: y - openingHalf - thick * 0.5, bw: deep, bh: thick },
      { cx: x, cy: y + openingHalf + thick * 0.5, bw: deep, bh: thick },
    ];
    if (!open) {
      boxes.push({ cx: x, cy: y, bw: Math.round(deep * 0.85), bh: Math.max(28, opening + 8) });
    }
    return boxes;
  }
  if (
    CITY_GATE_CLOSED_NS.has(assetId) ||
    CITY_GATE_OPEN_NS.has(assetId) ||
    assetId === HARBOR_GUARD_ARCH
  ) {
    const cy = y - size * 0.06;
    const boxes = [
      { cx: x - openingHalf - thick * 0.5, cy, bw: thick, bh: deep },
      { cx: x + openingHalf + thick * 0.5, cy, bw: thick, bh: deep },
    ];
    if (!open) {
      boxes.push({
        cx: x,
        cy,
        bw: Math.max(28, opening + 12),
        bh: Math.round(deep * 0.9),
      });
    }
    return boxes;
  }
  return [];
}

/** Invisible static footprint under a world prop (alpha silhouette by layer mode). */
export function addPropFootprint(
  scene: Phaser.Scene,
  assetId: string,
  x: number,
  y: number,
  size: number,
): void {
  const group=ensurePropColliderGroup(scene);
  const mode=propColliderMode(assetId) as SilhouetteColliderMode;
  const gateKey=isCityGateAsset(assetId)?`gate:${Math.round(x)}:${Math.round(y)}`:undefined;
  for(const box of propCollisionBoxes(assetId,x,y,size))addStaticBox(scene,group,box.cx,box.cy,box.bw,box.bh,mode,gateKey);
}

export function bindPlayerToPropColliders(
  scene: Phaser.Scene,
  player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
): void {
  // PlayerController uses the same swept geometry as the server; prop bodies serve NPC queries.
  void scene;void player;
}

/** Replace collider boxes for one city gate after open/close swap. */
export function refreshCityGateFootprint(
  scene: Phaser.Scene,
  assetId: string,
  x: number,
  y: number,
  size: number,
): void {
  invalidatePropIndex(scene);
  const gateKey = `gate:${Math.round(x)}:${Math.round(y)}`;
  const group = scene.data.get(PROP_COLLIDER_GROUP_KEY) as
    | Phaser.Physics.Arcade.StaticGroup
    | undefined;
  if (isPropColliderGroupAlive(group)) {
    const doomed: Phaser.GameObjects.GameObject[] = [];
    for (const child of group.getChildren()) {
      const go = child as Phaser.GameObjects.GameObject & { getData?: (k: string) => unknown };
      if (go.getData?.('cityGateKey') === gateKey) doomed.push(child);
    }
    for (const child of doomed) {
      try {
        group.remove(child, true, true);
      } catch {
        try {
          child.destroy();
        } catch {
          /* ignore */
        }
      }
    }
  }
  addPropFootprint(scene, assetId, x, y, size);
  if (isPropColliderGroupAlive(group)) group.refresh();
}

/** Drop static prop bodies + debug gfx (scene travel / shutdown). */
export function clearPropColliders(scene: Phaser.Scene): void {
  invalidatePropIndex(scene);
  const group = scene.data.get(PROP_COLLIDER_GROUP_KEY) as
    | Phaser.Physics.Arcade.StaticGroup
    | undefined;
  scene.data.remove(PROP_COLLIDER_GROUP_KEY);
  if (isPropColliderGroupAlive(group)) {
    try {
      group.clear(true, true);
    } catch {
      /* ignore */
    }
    try {
      group.destroy(true);
    } catch {
      /* ignore */
    }
  }
  const dbg = scene.data.get(PROP_DEBUG_KEY) as Phaser.GameObjects.Graphics | undefined;
  if (dbg) {
    try {
      dbg.destroy();
    } catch {
      /* ignore */
    }
    scene.data.remove(PROP_DEBUG_KEY);
  }
  clearPropOpaqueCache();
  const shadowGfx = scene.data.get('propGroundShadowGfx') as Phaser.GameObjects.Graphics | undefined;
  if (shadowGfx) {
    try {
      shadowGfx.destroy();
    } catch {
      /* ignore */
    }
    scene.data.remove('propGroundShadowGfx');
  }
}

type PropBody=Pick<Phaser.Physics.Arcade.StaticBody,'left'|'right'|'top'|'bottom'>;
interface PropIndex {group:Phaser.Physics.Arcade.StaticGroup;count:number;revision:number;cells:Map<string,PropBody[]>}
const propIndexes=new WeakMap<Phaser.Scene,PropIndex>();
const propRevisions=new WeakMap<Phaser.Scene,number>();
const PROP_INDEX_CELL=128;
export function propCollisionRevision(scene:Phaser.Scene):number{return propRevisions.get(scene)??0;}
function invalidatePropIndex(scene:Phaser.Scene):void{propIndexes.delete(scene);propRevisions.set(scene,propCollisionRevision(scene)+1);}
function nearbyPropBodies(scene:Phaser.Scene,x:number,y:number,radius:number):PropBody[]{
 const group=scene.data.get(PROP_COLLIDER_GROUP_KEY) as Phaser.Physics.Arcade.StaticGroup|undefined;
 if(!isPropColliderGroupAlive(group)||!group.getLength())return [];
 let index=propIndexes.get(scene);
 if(!index||index.group!==group||index.count!==group.getLength()||index.revision!==propCollisionRevision(scene)){
  const cells=new Map<string,PropBody[]>();
  for(const child of group.getChildren()){
   const body=(child as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as PropBody|undefined;if(!body)continue;
   for(let gy=Math.floor(body.top/PROP_INDEX_CELL);gy<=Math.floor(body.bottom/PROP_INDEX_CELL);gy++)for(let gx=Math.floor(body.left/PROP_INDEX_CELL);gx<=Math.floor(body.right/PROP_INDEX_CELL);gx++){
    const key=`${gx}:${gy}`,cell=cells.get(key)??[];cell.push(body);cells.set(key,cell);
   }
  }
  index={group,count:group.getLength(),revision:propCollisionRevision(scene),cells};propIndexes.set(scene,index);
 }
 const found=new Set<PropBody>();
 for(let gy=Math.floor((y-radius)/PROP_INDEX_CELL);gy<=Math.floor((y+radius)/PROP_INDEX_CELL);gy++)for(let gx=Math.floor((x-radius)/PROP_INDEX_CELL);gx<=Math.floor((x+radius)/PROP_INDEX_CELL);gx++)for(const body of index.cells.get(`${gx}:${gy}`)??[])found.add(body);
 return [...found];
}

export function isInsidePropAabb(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius = 14,
): boolean {
  for (const body of nearbyPropBodies(scene,x,y,radius)) {
    if (x >= body.left - radius && x <= body.right + radius && y >= body.top - radius && y <= body.bottom + radius) {
      return true;
    }
  }
  return false;
}

/**
 * Push a world point out of overlapping prop AABBs (prefer south), then off colliding tiles.
 * Used so NPCs aren't stuck inside building footprints after spawn.
 */
export function nudgePointFromPropColliders(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius = 14,
): { x: number; y: number } {
  const group = scene.data.get(PROP_COLLIDER_GROUP_KEY) as
    | Phaser.Physics.Arcade.StaticGroup
    | undefined;
  let px = x;
  let py = y;
  if (isPropColliderGroupAlive(group) && group.getLength() > 0) {
    for (let iter = 0; iter < 14; iter++) {
      let hit = false;
      for (const body of nearbyPropBodies(scene,px,py,radius)) {
        const left = body.left - radius;
        const right = body.right + radius;
        const top = body.top - radius;
        const bottom = body.bottom + radius;
        if (px < left || px > right || py < top || py > bottom) continue;
        const distS = bottom - py;
        const distN = py - top;
        const distW = px - left;
        const distE = right - px;
        const min = Math.min(distS, distN, distW, distE);
        if (min === distS) py = bottom + 1;
        else if (min === distN) py = top - 1;
        else if (min === distW) px = left - 1;
        else px = right + 1;
        hit = true;
      }
      if (!hit) break;
    }
  }
  return nudgeFromGroundTiles(scene, px, py);
}
