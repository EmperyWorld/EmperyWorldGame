/**
 * Spatial audit vs Tiled + sprite AABB — not table-vs-table.
 * Writes JSON + PNG. Exit 1 if blocking issues.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  GUARD_PATROL_TILES,
  HAVEN_NPC_POSTS,
  NPC_SLEEP_HOME_TILES,
  havenPropSpriteAabb,
  havenTravelPadAabb,
  worldToHavenTile,
  HAVEN_TRAVEL_PAD_DEFAULT_RADIUS,
} from '@empery/shared';
import { ALL_CITIZEN_DEFS } from '../apps/client/src/sprites/haven-ambient-defs.ts';
import { HAVEN_CITY_PROPS } from '../apps/client/src/sprites/haven-city-data.ts';
import {
  HAVEN_DISTRICTS,
  HAVEN_NPC_BUILDINGS,
  havenLandmarkFootprint,
} from '../apps/client/src/sprites/haven-npc-buildings.ts';
import { isWalkableTileGid } from '../apps/client/src/game/systems/world-geodata.ts';
import { getLocation } from '../apps/server/src/services/locations.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TW = 64;
const YAML_ONLY = new Set(['town_notice_board', 'stage_bard', 'town_hq_sentry']);

const NPC_LANDMARK: Record<string, string> = {
  town_captain: 'prop_barracks',
  town_guard: 'prop_barracks',
  town_merchant: 'prop_trade_hall',
  town_butcher: 'prop_butcher',
  town_radio: 'prop_radio_booth',
  town_blacksmith: 'prop_blacksmith',
  town_miller: 'prop_windmill',
  town_stable: 'prop_stable',
  town_priest: 'prop_cathedral',
  town_scribe: 'prop_library',
  town_healer: 'prop_healer_hall',
  town_teacher: 'prop_schoolhouse',
  town_innkeeper: 'prop_inn',
  town_innkeeper_day: 'prop_inn',
  town_bathkeeper: 'prop_bathhouse',
  town_brewer: 'prop_brewery',
  town_fisher: 'prop_fishmonger',
  town_dockhand: 'prop_warehouse',
};

type Issue = { sev: 'block' | 'warn'; id: string; detail: string };

const issues: Issue[] = [];
const block = (id: string, detail: string): void => {
  issues.push({ sev: 'block', id, detail });
};
const warn = (id: string, detail: string): void => {
  issues.push({ sev: 'warn', id, detail });
};

const loc = getLocation('empery_haven');
if (!loc) throw new Error('no haven');

const tiled = JSON.parse(
  (await import('node:fs')).readFileSync(join(root, 'apps/client/public/maps/empery_haven.json'), 'utf8'),
) as { width: number; height: number; layers: Array<{ data?: number[] }> };
const data = tiled.layers[0]?.data ?? [];
const gid = (tx: number, ty: number): number => {
  if (tx < 0 || ty < 0 || tx >= tiled.width || ty >= tiled.height) return 0;
  return data[ty * tiled.width + tx] ?? 0;
};
const gidWorld = (x: number, y: number): number => {
  const [tx, ty] = worldToHavenTile(x, y);
  return gid(tx, ty);
};

function inFoot(x: number, y: number, box: { L: number; R: number; T: number; B: number }): boolean {
  return x >= box.L && x <= box.R && y >= box.T && y <= box.B;
}

function inEllipse(x: number, y: number, cx: number, cy: number, w: number, h: number): boolean {
  const rx = w / 2;
  const ry = h / 2;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

for (const npc of loc.npcs ?? []) {
  const g = gidWorld(npc.x, npc.y);
  if (!isWalkableTileGid(g)) block(npc.id, `NPC on gid=${g} at ${npc.x},${npc.y} tile ${worldToHavenTile(npc.x, npc.y)}`);
  if (!YAML_ONLY.has(npc.id)) {
    const p = HAVEN_NPC_POSTS.find((x) => x.id === npc.id);
    if (!p || p.postX !== npc.x || p.postY !== npc.y) block(npc.id, 'post ≠ yaml');
  }
  const propId = NPC_LANDMARK[npc.id];
  if (propId) {
    const b = HAVEN_NPC_BUILDINGS.find((x) => x.prop === propId);
    if (b) {
      const fp = havenLandmarkFootprint(b.x, b.y, b.size);
      if (inFoot(npc.x, npc.y, fp)) {
        block(npc.id, `inside ${propId} footprint LRTB=${JSON.stringify(fp)} npc=${npc.x},${npc.y}`);
      }
      if (npc.y <= b.y) {
        block(npc.id, `not south of ${propId} origin b=${b.x},${b.y} npc=${npc.x},${npc.y}`);
      }
    }
  }
}

for (const b of HAVEN_NPC_BUILDINGS) {
  const g = gidWorld(b.x, b.y);
  if (g === 3) block(b.prop, `colossus origin in water ${b.x},${b.y}`);
  const vis = havenPropSpriteAabb(b.x, b.y, b.size);
  const samples: Array<[number, number]> = [
    [b.x, b.y],
    [(vis.L + vis.R) / 2, vis.T + 8],
    [(vis.L + vis.R) / 2, vis.B - 8],
  ];
  let waterHits = 0;
  for (const [x, y] of samples) if (gidWorld(x, y) === 3) waterHits += 1;
  if (waterHits >= 2) warn(b.prop, `sprite samples mostly water`);
}

for (const z of loc.zones ?? []) {
  if (!z.travelTo) continue;
  const pad = havenTravelPadAabb(z.x, z.y, z.radius ?? HAVEN_TRAVEL_PAD_DEFAULT_RADIUS);
  const cx = (pad.L + pad.R) / 2;
  const cy = (pad.T + pad.B) / 2;
  const g = gidWorld(cx, cy);
  if (!isWalkableTileGid(g)) block(`travel:${z.label}`, `pad center gid=${g} yaml=${z.x},${z.y} pad=${cx},${cy}`);
}

for (const st of loc.stations ?? []) {
  const g = gidWorld(st.x, st.y);
  if (g === 3) block(st.id, `station in water`);
  if (g === 4) warn(st.id, `station on wall gid=4 ${st.x},${st.y}`);
}

ALL_CITIZEN_DEFS.forEach((def, i) => {
  def.tiles.forEach(([tx, ty], wi) => {
    const g = gid(tx, ty);
    if (g === 3) block(`ambient#${i}.${wi}`, `${def.look} water ${tx},${ty}`);
    if (wi === 0 && !isWalkableTileGid(g)) block(`ambient#${i}`, `${def.look} start gid=${g} ${tx},${ty}`);
  });
});

GUARD_PATROL_TILES.forEach(([tx, ty], i) => {
  if (!isWalkableTileGid(gid(tx, ty))) block(`patrol#${i}`, `gid=${gid(tx, ty)} ${tx},${ty}`);
});

for (const [id, tile] of Object.entries(NPC_SLEEP_HOME_TILES)) {
  if (gid(tile[0], tile[1]) === 3) block(`home:${id}`, `sleep water ${tile}`);
}

const districtForNpc: Record<string, string> = {
  town_merchant: 'Рыночный ряд',
  town_butcher: 'Рыночный ряд',
  town_captain: 'Гарнизон',
  town_guard: 'Гарнизон',
  town_priest: 'Муниципальный холм',
  town_scribe: 'Муниципальный холм',
  town_innkeeper: 'Сервисный двор',
  town_brewer: 'Сервисный двор',
  town_bathkeeper: 'Сервисный двор',
  town_blacksmith: 'Квартал ремёсел',
  town_fisher: 'Портовые склады',
  town_dockhand: 'Портовые склады',
  town_hq_sentry: 'EmperyWorld HQ',
};

for (const npc of loc.npcs ?? []) {
  const want = districtForNpc[npc.id];
  if (!want) continue;
  const d = HAVEN_DISTRICTS.find((x) => x.label === want);
  if (!d) continue;
  if (!inEllipse(npc.x, npc.y, d.x, d.y, d.w, d.h)) {
    warn(npc.id, `outside district ellipse «${want}» npc=${npc.x},${npc.y} c=${d.x},${d.y} ${d.w}x${d.h}`);
  }
}

const hq = HAVEN_DISTRICTS.find((d) => d.label === 'EmperyWorld HQ');
if (hq) {
  const south = hq.y + hq.h / 2;
  if (south > 40 * TW + 8) block('hq-halo', `ellipse south ${south} past campus ty40=${40 * TW}`);
}

let propsOnWater = 0;
const waterProps: string[] = [];
for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
  if (id.includes('ship') || id.includes('pier') || id.includes('rowboat') || id.includes('quay')) continue;
  if (gidWorld(x, y) === 3 && (size ?? 0) >= 90) {
    propsOnWater += 1;
    if (waterProps.length < 12) waterProps.push(`${id}@${x},${y}`);
  }
}
if (propsOnWater) warn('props-water', `${propsOnWater} large land props origin in water: ${waterProps.join('; ')}`);

const out = {
  generatedAt: new Date().toISOString(),
  blocking: issues.filter((i) => i.sev === 'block'),
  warnings: issues.filter((i) => i.sev === 'warn'),
  npcs: (loc.npcs ?? []).map((n) => ({ ...n, tile: worldToHavenTile(n.x, n.y), gid: gidWorld(n.x, n.y) })),
  buildings: HAVEN_NPC_BUILDINGS.map((b) => ({
    ...b,
    aabb: havenPropSpriteAabb(b.x, b.y, b.size),
    foot: havenLandmarkFootprint(b.x, b.y, b.size),
  })),
  districts: HAVEN_DISTRICTS,
  zones: loc.zones ?? [],
  stations: loc.stations ?? [],
  spawn: loc.spawn,
  tiles: { width: tiled.width, height: tiled.height, data },
};

const jsonPath = join(root, 'svodka/haven-spatial-audit.json');
writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);

const py = join(root, 'scripts/render-haven-spatial-png.py');
const png = join(root, 'svodka/haven-spatial-audit.png');
writeFileSync(
  py,
  `#!/usr/bin/env python3
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(${JSON.stringify(root)})
data = json.loads(Path(${JSON.stringify(jsonPath)}).read_text())
W, H, tw = 80, 56, 64
scale = 0.18
pw, ph = int(W * tw * scale), int(H * tw * scale)
img = Image.new("RGB", (pw, ph), (10, 12, 16))
draw = ImageDraw.Draw(img, "RGBA")
gids = data["tiles"]["data"]
fill = {1: (45, 74, 50), 2: (106, 96, 80), 3: (26, 48, 72), 4: (58, 58, 66)}
twp = tw * scale
for i, g in enumerate(gids):
    tx, ty = i % W, i // W
    c = fill.get(g)
    if not c: continue
    x0, y0 = tx * twp, ty * twp
    draw.rectangle([x0, y0, x0 + twp + 0.5, y0 + twp + 0.5], fill=c)

def P(x, y):
    return (x * scale, y * scale)

for d in data["districts"]:
    x, y, w, h = d["x"], d["y"], d["w"], d["h"]
    box = [P(x - w/2, y - h/2), P(x + w/2, y + h/2)]
    draw.ellipse([box[0], box[1]], outline=(200, 180, 80, 180), width=2)
    draw.text(P(d["signX"], d["signY"]), d["label"], fill=(230, 220, 180))

for b in data["buildings"]:
    a = b["aabb"]
    draw.rectangle([P(a["L"], a["T"]), P(a["R"], a["B"])], outline=(240, 180, 60), width=2)
    draw.rectangle([P(b["x"]-4, b["y"]-4), P(b["x"]+4, b["y"]+4)], fill=(240, 200, 80))
    draw.text(P(b["x"]+6, b["y"]-10), b["prop"].replace("prop_", ""), fill=(255, 220, 120))

for n in data["npcs"]:
    col = (90, 160, 255) if n["gid"] in (1, 2) else (224, 70, 70)
    draw.ellipse([P(n["x"]-10, n["y"]-10), P(n["x"]+10, n["y"]+10)], fill=col)
    draw.text(P(n["x"]+8, n["y"]-14), n["id"].replace("town_", ""), fill=(255, 255, 255))

sp = data["spawn"]
draw.rectangle([P(sp["x"]-8, sp["y"]-8), P(sp["x"]+8, sp["y"]+8)], fill=(255, 204, 136))

img.save(${JSON.stringify(png)})
print("wrote", ${JSON.stringify(png)})
`,
);

const r = spawnSync('python3', [py], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
console.log(r.stdout.trim());
console.log(JSON.stringify({ blocking: out.blocking, warnings: out.warnings }, null, 2));
if (out.blocking.length) process.exit(1);
