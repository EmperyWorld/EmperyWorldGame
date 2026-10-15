/**
 * AABB / walkable audit — not table-vs-table centers.
 * Uses sprite quads, collision footprints, Tiled GIDs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  havenLandmarkFootprint,
  HAVEN_NPC_BUILDINGS,
} from '../apps/client/src/sprites/haven-npc-buildings.ts';
import { HAVEN_CITY_PROPS } from '../apps/client/src/sprites/haven-city-data.ts';
import { footprintForProp, PROP_PASS } from '../apps/client/src/sprites/prop-footprint.ts';
import { ALL_CITIZEN_DEFS } from '../apps/client/src/sprites/haven-ambient-defs.ts';
import {
  HAVEN_NPC_POSTS,
  HAVEN_TENEMENT,
  havenWorldFromTile,
  worldToHavenTile,
  havenPropSpriteAabb,
  type HavenAabb,
} from '@empery/shared';
import { isWalkableTileGid } from '../apps/client/src/game/systems/world-geodata.ts';
import { HAVEN } from './layouts/empery_haven.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TW = 64;
const GAP = TW; // 1 tile between building walls

type Box = HavenAabb & { id: string; x: number; y: number; size: number };

function aabbOverlap(a: HavenAabb, b: HavenAabb, pad = 0): boolean {
  return a.R > b.L + pad && a.L < b.R - pad && a.B > b.T + pad && a.T < b.B - pad;
}

function expand(box: HavenAabb, pad: number): HavenAabb {
  return { L: box.L - pad, R: box.R + pad, T: box.T - pad, B: box.B + pad };
}

function collideAabb(id: string, x: number, y: number, size: number): HavenAabb | null {
  if (PROP_PASS.has(id)) return null;
  const fp = footprintForProp(id, size);
  if (!fp) return null;
  const bw = Math.max(14, size * fp.w);
  const bh = Math.max(12, size * fp.h);
  const cy = y + size * fp.oy;
  return { L: x - bw / 2, R: x + bw / 2, T: cy - bh / 2, B: cy + bh / 2 };
}

function tilesCovered(box: HavenAabb): Array<[number, number]> {
  const tx0 = Math.floor(box.L / TW);
  const ty0 = Math.floor(box.T / TW);
  const tx1 = Math.floor((box.R - 0.01) / TW);
  const ty1 = Math.floor((box.B - 0.01) / TW);
  const out: Array<[number, number]> = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) out.push([tx, ty]);
  }
  return out;
}

const tiled = JSON.parse(
  readFileSync(join(root, 'apps/client/public/maps/empery_haven.json'), 'utf8'),
) as { width: number; height: number; layers: Array<{ data?: number[] }> };
const data = tiled.layers[0]?.data ?? [];
const gid = (tx: number, ty: number): number => {
  if (tx < 0 || ty < 0 || tx >= tiled.width || ty >= tiled.height) return 0;
  return data[ty * tiled.width + tx] ?? 0;
};

const buildings: Box[] = [
  ...HAVEN_NPC_BUILDINGS.map((b) => {
    const fp = havenLandmarkFootprint(b.x, b.y, b.size);
    return { id: b.prop, x: b.x, y: b.y, size: b.size, ...fp };
  }),
  {
    id: HAVEN_TENEMENT.prop ?? 'prop_tenement_block',
    x: HAVEN_TENEMENT.x,
    y: HAVEN_TENEMENT.y,
    size: HAVEN_TENEMENT.size,
    ...havenLandmarkFootprint(HAVEN_TENEMENT.x, HAVEN_TENEMENT.y, HAVEN_TENEMENT.size),
  },
];

const buildingVsBuilding: string[] = [];
for (let i = 0; i < buildings.length; i++) {
  for (let j = i + 1; j < buildings.length; j++) {
    const a = buildings[i]!;
    const b = buildings[j]!;
    if (aabbOverlap(expand(a, GAP / 2), expand(b, GAP / 2))) {
      buildingVsBuilding.push(
        `${a.id} (${a.x},${a.y} size=${a.size} ${Math.round(a.L)}..${Math.round(a.R)},${Math.round(a.T)}..${Math.round(a.B)}) ∩ ${b.id} (${b.x},${b.y} size=${b.size})`,
      );
    }
  }
}

const uniqueBuildings: Box[] = [];
for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
  if (
    id.startsWith('prop_house_') ||
    (size >= 120 &&
      !id.includes('fence') &&
      !id.includes('lamp') &&
      !id.includes('banner') &&
      !id.startsWith('prop_city_wall') &&
      !id.startsWith('prop_city_gate') &&
      !id.startsWith('prop_pier') &&
      !id.startsWith('prop_ship') &&
      !id.startsWith('prop_hq_fence'))
  ) {
    const vis = havenPropSpriteAabb(x, y, size);
    uniqueBuildings.push({ id, x, y, size, ...vis });
  }
}

const uniqueOverlaps: string[] = [];
for (let i = 0; i < uniqueBuildings.length; i++) {
  for (let j = i + 1; j < uniqueBuildings.length; j++) {
    const a = uniqueBuildings[i]!;
    const b = uniqueBuildings[j]!;
    if (aabbOverlap(a, b, 8)) {
      uniqueOverlaps.push(`${a.id}@${a.x},${a.y} ∩ ${b.id}@${b.x},${b.y}`);
    }
  }
}

const occ = new Map<string, string>();
const claim = (tx: number, ty: number, who: string): string | null => {
  const k = `${tx},${ty}`;
  const prev = occ.get(k);
  if (prev) return prev;
  occ.set(k, who);
  return null;
};

for (const b of buildings) {
  for (const [tx, ty] of tilesCovered(expand(b, 0))) {
    claim(tx, ty, `land:${b.id}`);
  }
}

const propOnWall: string[] = [];
const propOnLand: string[] = [];
const propOnProp: string[] = [];
const propNotWalkable: string[] = [];

for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
  const [tx, ty] = worldToHavenTile(x, y);
  const g = gid(tx, ty);
  const pass = PROP_PASS.has(id) || !footprintForProp(id, size);
  // Заборные/настенные пропы: город (стены/ворота/башни) и периметр HQ
  // (fence/sniper/floodlight/panel — прожекторы и панели монтируются прямо
  // на забор по геймдизайну, это не баг, а декор на заборе).
  const wallMounted =
    id.startsWith('prop_city_wall') ||
    id.startsWith('prop_city_gate') ||
    id.startsWith('prop_hq_fence') ||
    id.startsWith('prop_guard_tower') ||
    id.startsWith('prop_hq_sniper') ||
    id.startsWith('prop_hq_floodlight') ||
    id.startsWith('prop_hq_panel') ||
    id.startsWith('prop_hq_server_rack') ||
    id.startsWith('prop_wall');
  if (!isWalkableTileGid(g) && !wallMounted && !id.startsWith('prop_pier') && !id.startsWith('prop_ship') && id !== 'prop_rowboat') {
    propNotWalkable.push(`${id}@${x},${y} tile=${tx},${ty} gid=${g}`);
  }
  if (g === 4 && !wallMounted) {
    propOnWall.push(`${id}@${x},${y} tile=${tx},${ty}`);
  }
  if (pass) continue;
  const box = collideAabb(id, x, y, size);
  if (!box) continue;
  const who = `${id}@${x},${y}`;
  for (const [cx, cy] of tilesCovered(box)) {
    const prev = occ.get(`${cx},${cy}`);
    if (prev?.startsWith('land:')) {
      propOnLand.push(`${who} on ${prev} tile=${cx},${cy}`);
    } else if (prev?.startsWith('prop:') && prev !== who) {
      propOnProp.push(`${who} on ${prev} tile=${cx},${cy}`);
    } else if (!prev) {
      claim(cx, cy, `prop:${who}`);
    }
  }
}

function neighborhoodClear(tx: number, ty: number): string[] {
  const bad: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx;
      const ny = ty + dy;
      const g = gid(nx, ny);
      if (!isWalkableTileGid(g)) bad.push(`tile ${nx},${ny} gid=${g}`);
      const occu = occ.get(`${nx},${ny}`);
      if (occu && !occu.startsWith('npc:')) bad.push(`tile ${nx},${ny} ${occu}`);
    }
  }
  return bad;
}

/** Real blocker: the stand tile itself is unwalkable or claimed by land/prop (citizen visually inside a building). */
function selfTileBlocked(tx: number, ty: number): string | null {
  const g = gid(tx, ty);
  if (!isWalkableTileGid(g)) return `self tile ${tx},${ty} gid=${g} not walkable`;
  const occu = occ.get(`${tx},${ty}`);
  if (occu && !occu.startsWith('npc:')) return `self tile ${tx},${ty} ${occu}`;
  return null;
}

const npcIssues: string[] = [];
const npcSelfBlocked: string[] = [];
for (const n of HAVEN.npcs) {
  const [tx, ty] = worldToHavenTile(n.x, n.y);
  const bad = neighborhoodClear(tx, ty);
  if (bad.length) npcIssues.push(`${n.id} ${n.x},${n.y} tile=${tx},${ty} :: ${bad.slice(0, 6).join('; ')}`);
  const self = selfTileBlocked(tx, ty);
  if (self) npcSelfBlocked.push(`${n.id} ${n.x},${n.y} tile=${tx},${ty} :: ${self}`);
}

const postIssues: string[] = [];
const postSelfBlocked: string[] = [];
for (const post of HAVEN_NPC_POSTS) {
  const [tx, ty] = worldToHavenTile(post.postX, post.postY);
  const bad = neighborhoodClear(tx, ty);
  if (bad.length) postIssues.push(`${post.id} ${post.postX},${post.postY} tile=${tx},${ty} :: ${bad.slice(0, 4).join('; ')}`);
  const self = selfTileBlocked(tx, ty);
  if (self) postSelfBlocked.push(`${post.id} ${post.postX},${post.postY} tile=${tx},${ty} :: ${self}`);
}

// Твёрдые коллизии всех пропов (для проверки, что путь NPC между вейпоинтами
// не режет здание насквозь — раньше проверялись только сами точки, а
// прямой отрезок между ними мог пройти через дом на скорости).
const solidBoxes: HavenAabb[] = [];
for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
  const box = collideAabb(id, x, y, size);
  if (box) solidBoxes.push(box);
}

/** Liang-Barsky segment-vs-AABB intersection (true if segment crosses the box interior). */
function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, box: HavenAabb): boolean {
  let tMin = 0;
  let tMax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > tMax) return false;
      if (r > tMin) tMin = r;
    } else {
      if (r < tMin) return false;
      if (r < tMax) tMax = r;
    }
    return true;
  };
  if (!clip(-dx, x0 - box.L)) return false;
  if (!clip(dx, box.R - x0)) return false;
  if (!clip(-dy, y0 - box.T)) return false;
  if (!clip(dy, box.B - y0)) return false;
  return tMin < tMax;
}

const citizenPathIssues: string[] = [];
let pi = 0;
for (const def of ALL_CITIZEN_DEFS) {
  const tiles = def.tiles ?? [];
  if ((def.speed ?? 0) > 0 && tiles.length >= 2) {
    for (let i = 0; i < tiles.length - 1; i++) {
      const { x: ax, y: ay } = havenWorldFromTile(tiles[i]![0], tiles[i]![1]);
      const { x: bx, y: by } = havenWorldFromTile(tiles[i + 1]![0], tiles[i + 1]![1]);
      for (const box of solidBoxes) {
        // Пад в 6px — не считаем касание самого края стены багом.
        if (segmentHitsBox(ax, ay, bx, by, expand(box, -6))) {
          citizenPathIssues.push(
            `path#${pi} ${def.look} [${tiles[i]}]→[${tiles[i + 1]}] cuts building box L${Math.round(box.L)} R${Math.round(box.R)} T${Math.round(box.T)} B${Math.round(box.B)}`,
          );
          break;
        }
      }
    }
  }
  pi += 1;
}

const citizenIssues: string[] = [];
const citizenSelfBlocked: string[] = [];
let ci = 0;
for (const def of ALL_CITIZEN_DEFS) {
  const tiles = def.tiles ?? [];
  for (const [tx, ty] of tiles) {
    const bad = neighborhoodClear(tx, ty);
    if (bad.length) {
      citizenIssues.push(`ambient#${ci} ${def.look} [${tx},${ty}] :: ${bad.slice(0, 4).join('; ')}`);
    }
    const self = selfTileBlocked(tx, ty);
    if (self) citizenSelfBlocked.push(`ambient#${ci} ${def.look} [${tx},${ty}] :: ${self}`);
  }
  if (def.sleepTile) {
    const [tx, ty] = def.sleepTile;
    const bad = neighborhoodClear(tx, ty);
    if (bad.length) citizenIssues.push(`ambient#${ci} ${def.look} sleep [${tx},${ty}] :: ${bad.slice(0, 4).join('; ')}`);
    const self = selfTileBlocked(tx, ty);
    if (self) citizenSelfBlocked.push(`ambient#${ci} ${def.look} sleep [${tx},${ty}] :: ${self}`);
  }
  ci += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    colossi: buildings.length,
    uniqueBuildings: uniqueBuildings.length,
    props: HAVEN_CITY_PROPS.length,
    buildingVsBuilding: buildingVsBuilding.length,
    uniqueOverlaps: uniqueOverlaps.length,
    propOnWall: propOnWall.length,
    propOnLand: propOnLand.length,
    propOnProp: propOnProp.length,
    propNotWalkable: propNotWalkable.length,
    npcIssues: npcIssues.length,
    postIssues: postIssues.length,
    citizenIssues: citizenIssues.length,
    citizenPathIssues: citizenPathIssues.length,
    npcSelfBlocked: npcSelfBlocked.length,
    postSelfBlocked: postSelfBlocked.length,
    citizenSelfBlocked: citizenSelfBlocked.length,
  },
  buildingVsBuilding,
  uniqueOverlaps: uniqueOverlaps.slice(0, 80),
  propOnWall: propOnWall.slice(0, 80),
  propOnLand: propOnLand.slice(0, 80),
  propOnProp: propOnProp.slice(0, 80),
  propNotWalkable: propNotWalkable.slice(0, 80),
  npcIssues,
  postIssues,
  citizenIssues: citizenIssues.slice(0, 120),
  citizenPathIssues: citizenPathIssues.slice(0, 200),
  npcSelfBlocked,
  postSelfBlocked,
  citizenSelfBlocked,
};

writeFileSync(join(root, 'svodka/haven-aabb-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.counts, null, 2));
console.log('--- colossi ---');
for (const l of buildingVsBuilding) console.log(l);
console.log('--- unique overlaps sample ---');
for (const l of uniqueOverlaps.slice(0, 25)) console.log(l);
console.log('--- npc ---');
for (const l of npcIssues) console.log(l);
console.log('--- props wall/land/stack ---', propOnWall.length, propOnLand.length, propOnProp.length);
for (const l of [...propOnWall.slice(0, 15), ...propOnLand.slice(0, 15), ...propOnProp.slice(0, 15)]) {
  console.log(l);
}
console.log(
  '--- SELF-TILE blocked (real walk/spawn blocker) ---',
  npcSelfBlocked.length,
  postSelfBlocked.length,
  citizenSelfBlocked.length,
);
for (const l of [...npcSelfBlocked, ...postSelfBlocked, ...citizenSelfBlocked.slice(0, 60)]) console.log(l);
void havenWorldFromTile;
