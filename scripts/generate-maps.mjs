#!/usr/bin/env node
import { EMPERY_HQ_LOBBY, EMPERY_HQ_LOBBY_NPCS } from '../packages/shared/dist/empery-hq-lobby.js';
/**
 * Generates location maps.
 * Base design grid 20×14 @ 64px → SCALE× larger world for ranged play / denser content.
 */
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHavenTiles,
  havenPropPlacements,
  havenYamlFragment,
  HAVEN,
  W as HAVEN_W,
  H as HAVEN_H,
} from './layouts/empery_haven.mjs';
import { buildEmperyHqTiles, EMPERY_HQ } from './layouts/empery_hq.mjs';

const SCALE = 4;
const W = 20 * SCALE; // 80 — default for non-Haven outdoor maps
const H = 14 * SCALE; // 56
const TW = 64;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HAVEN_PROP_OVERRIDE_PATH = join(
  root,
  'content/layouts/empery_haven-props.override.json',
);

const t = (n) => Math.round(n * SCALE);

function rect(data, x, y, w, h, tile) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && px < W && py >= 0 && py < H) data[py * W + px] = tile;
    }
  }
}

function border(data, tile = 4) {
  for (let x = 0; x < W; x++) {
    data[x] = tile;
    data[(H - 1) * W + x] = tile;
  }
  for (let y = 0; y < H; y++) {
    data[y * W] = tile;
    data[y * W + W - 1] = tile;
  }
}

/** Open a walkable gate in the outer wall (tile coords). */
function gate(data, tx, ty, w = 2, h = 2, tile = 2) {
  rect(data, tx, ty, w, h, tile);
}

function base(fill = 1) {
  return Array(W * H).fill(fill);
}

/** Force walkable ground under gameplay hotspots (pixel coords from YAML). */
function stampWalk(data, points, tile = 1) {
  for (const [px, py] of points) {
    const tx = Math.floor(px / TW);
    const ty = Math.floor(py / TW);
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const onCorner =
        (nx === 0 || nx === W - 1) && (ny === 0 || ny === H - 1);
      if (onCorner) continue;
      data[ny * W + nx] = tile;
    }
  }
}

const maps = {
  starter_grove: () => {
    const d = base(1);
    border(d);
    gate(d, t(9), 0, t(2), t(2));
    gate(d, t(14), 0, t(2), t(2));
    gate(d, t(1), 0, t(2), t(2));
    rect(d, t(8), t(1), t(4), t(1), 2);
    rect(d, t(1), t(5), t(2), t(4), 2);
    rect(d, t(15), t(4), t(3), t(6), 2);
    rect(d, t(7), t(11), t(6), t(2), 2);
    rect(d, t(6), t(8), t(8), t(3), 3);
    rect(d, t(2), t(2), t(3), t(3), 4);
    rect(d, t(15), t(2), t(3), t(2), 4);
    rect(d, t(16), t(9), t(2), t(3), 4);
    stampWalk(
      d,
      [
        [640, 480],
        [400, 400],
        [900, 300],
        [960, 560],
        [780, 620],
        [520, 360],
        [700, 360],
        [980, 200],
        [1080, 420],
        [1020, 650],
        [120, 280],
        [160, 520],
        [640, 96],
        [980, 96],
        [110, 96],
      ].map(([x, y]) => [x * SCALE, y * SCALE]),
      2,
    );
    return d;
  },
  empery_haven: () => {
    const HW = HAVEN_W;
    const HH = HAVEN_H;
    const hRect = (data, x, y, w, h, tile) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && px < HW && py >= 0 && py < HH) data[py * HW + px] = tile;
        }
      }
    };
    const hBorder = (data, tile = 4) => {
      for (let x = 0; x < HW; x++) {
        data[x] = tile;
        data[(HH - 1) * HW + x] = tile;
      }
      for (let y = 0; y < HH; y++) {
        data[y * HW] = tile;
        data[y * HW + HW - 1] = tile;
      }
    };
    const hGate = (data, tx, ty, w = 2, h = 2, tile = 2) => {
      hRect(data, tx, ty, w, h, tile);
    };
    const hBase = (fill = 1) => Array(HW * HH).fill(fill);
    const hStamp = (data, points, tile = 1) => {
      for (const [px, py] of points) {
        const tx = Math.floor(px / TW);
        const ty = Math.floor(py / TW);
        for (const [dx, dy] of [
          [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [1, -1], [-1, 1], [1, 1],
          [-2, 0], [2, 0], [0, -2], [0, 2],
        ]) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= HW || ny >= HH) continue;
          const onCorner = (nx === 0 || nx === HW - 1) && (ny === 0 || ny === HH - 1);
          if (onCorner) continue;
          data[ny * HW + nx] = tile;
        }
      }
    };
    return buildHavenTiles(hRect, hBorder, hGate, hBase, hStamp);
  },
  empery_hq_lobby: () => {
    const {width:w,height:h}=EMPERY_HQ_LOBBY;
    const data=Array(w*h).fill(2);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x===0||y===0||x===w-1||y===h-1)data[y*w+x]=4;
    data[(h-1)*w+w/2-1]=2;data[(h-1)*w+w/2]=2;
    return data;
  },
  empery_hq: () =>
    buildEmperyHqTiles(
      (data, x, y, w, h, tile) => {
        const HW = 40;
        const HH = 32;
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && px < HW && py >= 0 && py < HH) data[py * HW + px] = tile;
          }
        }
      },
      (data, tile = 4) => {
        const HW = 40;
        const HH = 32;
        for (let x = 0; x < HW; x++) {
          data[x] = tile;
          data[(HH - 1) * HW + x] = tile;
        }
        for (let y = 0; y < HH; y++) {
          data[y * HW] = tile;
          data[y * HW + HW - 1] = tile;
        }
      },
      (fill = 1) => Array(40 * 32).fill(fill),
    ),
  silverwood: () => {
    const d = base(1);
    border(d);
    gate(d, t(9), t(12), t(2), t(2));
    rect(d, t(2), t(2), t(4), t(3), 4);
    rect(d, t(14), t(2), t(4), t(3), 4);
    rect(d, t(1), t(9), t(3), t(3), 4);
    rect(d, t(16), t(8), t(3), t(4), 4);
    rect(d, t(4), t(4), t(3), t(4), 3);
    rect(d, t(9), t(2), t(2), t(10), 2);
    rect(d, t(13), t(5), t(3), t(3), 3);
    rect(d, t(6), t(10), t(8), t(2), 2);
    rect(d, t(8), t(1), t(4), t(1), 2);
    stampWalk(
      d,
      [
        [640, 480],
        [380, 380],
        [820, 320],
        [520, 420],
        [900, 580],
        [700, 300],
        [640, 120],
        [520, 180],
        [760, 160],
        [640, 820],
      ].map(([x, y]) => [x * SCALE, y * SCALE]),
      2,
    );
    return d;
  },
  ash_highlands: () => {
    const d = base(1);
    border(d);
    gate(d, t(9), t(12), t(2), t(2));
    rect(d, t(2), t(2), t(5), t(4), 4);
    rect(d, t(13), t(2), t(5), t(4), 4);
    rect(d, t(2), t(9), t(4), t(3), 4);
    rect(d, t(14), t(8), t(4), t(4), 4);
    rect(d, t(8), t(3), t(4), t(3), 3);
    rect(d, t(15), t(5), t(3), t(2), 3);
    rect(d, t(3), t(6), t(2), t(2), 3);
    rect(d, t(7), t(7), t(6), t(2), 2);
    rect(d, t(14), t(1), t(4), t(2), 2);
    rect(d, t(8), t(1), t(4), t(12), 2);
    stampWalk(
      d,
      [
        [640, 520],
        [400, 520],
        [820, 320],
        [900, 520],
        [560, 440],
        [1020, 400],
        [480, 300],
        [1050, 280],
        [1120, 420],
        [980, 520],
        [1080, 600],
        [640, 820],
      ].map(([x, y]) => [x * SCALE, y * SCALE]),
      2,
    );
    return d;
  },
  adena_fields: () => {
    const d = base(1);
    border(d, 4);
    gate(d, t(9), 0, t(2), t(2));
    rect(d, t(7), t(2), t(6), t(10), 2);
    rect(d, t(2), t(5), t(16), t(1), 2);
    rect(d, t(2), t(8), t(16), t(1), 2);
    rect(d, t(3), t(3), t(2), t(2), 4);
    rect(d, t(15), t(3), t(2), t(2), 4);
    rect(d, t(3), t(10), t(2), t(2), 4);
    rect(d, t(15), t(10), t(2), t(2), 4);
    rect(d, t(9), t(5), t(2), t(2), 3);
    stampWalk(
      d,
      [
        [640, 780],
        [380, 300],
        [640, 280],
        [900, 300],
        [320, 460],
        [960, 460],
        [400, 620],
        [880, 620],
        [640, 500],
        [640, 96],
        [640, 440],
        [420, 620],
        [640, 600],
        [860, 620],
        [520, 360],
        [760, 360],
        [640, 520],
      ].map(([x, y]) => [x * SCALE, y * SCALE]),
      2,
    );
    return d;
  },
  shadow_depths: () => {
    const d = base(1);
    border(d, 4);
    gate(d, t(9), t(12), t(2), t(2));
    rect(d, t(8), t(1), t(4), t(12), 2);
    rect(d, t(2), t(3), t(5), t(2), 4);
    rect(d, t(13), t(3), t(5), t(2), 4);
    rect(d, t(2), t(8), t(4), t(3), 4);
    rect(d, t(14), t(8), t(4), t(3), 4);
    rect(d, t(6), t(5), t(8), t(2), 3);
    rect(d, t(9), t(10), t(2), t(3), 2);
    stampWalk(
      d,
      [
        [640, 720],
        [420, 480],
        [860, 500],
        [640, 360],
        [320, 300],
        [960, 320],
        [500, 620],
        [780, 620],
        [280, 420],
        [1000, 440],
        [480, 240],
        [820, 260],
        [360, 200],
        [920, 220],
        [640, 180],
        [640, 160],
        [640, 820],
      ].map(([x, y]) => [x * SCALE, y * SCALE]),
      2,
    );
    return d;
  },
  suburban_park: () => {
    const d = base(1);
    border(d, 4);
    // Gates: west → haven, east → future yard
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    // Main asphalt ring + cross paths
    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);
    // Inner walking loops
    rect(d, 12, 10, 56, 3, 2);
    rect(d, 12, 40, 56, 3, 2);
    rect(d, 12, 10, 3, 33, 2);
    rect(d, 65, 10, 3, 33, 2);

    // Central plaza around fountain
    rect(d, 32, 18, 16, 12, 2);

    // Pond (west lawn)
    rect(d, 8, 16, 12, 8, 3);
    // Shore path around pond
    rect(d, 8, 15, 14, 1, 2);
    rect(d, 8, 24, 14, 1, 2);

    // Soft lawn pockets (keep grass tile 1)
    rect(d, 20, 12, 10, 5, 1);
    rect(d, 50, 12, 10, 5, 1);
    rect(d, 20, 34, 10, 5, 1);
    rect(d, 50, 34, 10, 5, 1);

    stampWalk(
      d,
      [
        [2560, 1920],
        [2560, 1520],
        [320, 1792],
        [4800, 1792],
        [2560, 320],
        [1280, 1120],
        [1760, 1440],
        [3360, 1200],
        [3840, 1600],
        [2080, 2400],
        [3040, 2320],
        [4000, 2560],
        [1120, 2200],
        [2560, 2800],
        [1600, 2880],
      ],
      2,
    );
    return d;
  },
  abandoned_yard: () => {
    const d = base(1);
    border(d, 4);
    // West → park, east stub, south yard
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, H - 2, 4, 2, 2);

    // Dirt / concrete roads
    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);
    rect(d, 16, 12, 48, 3, 2);
    rect(d, 16, 38, 48, 3, 2);
    rect(d, 16, 12, 3, 29, 2);
    rect(d, 61, 12, 3, 29, 2);

    // Construction lots (keep grass/dirt as 1)
    rect(d, 22, 16, 14, 8, 1);
    rect(d, 44, 16, 14, 8, 1);
    rect(d, 22, 32, 14, 6, 1);
    rect(d, 44, 32, 14, 6, 1);

    // Mud puddles as "water" hazards in corners of lots
    rect(d, 24, 18, 4, 3, 3);
    rect(d, 52, 34, 5, 3, 3);

    // Warehouse pad
    rect(d, 50, 20, 14, 10, 2);

    stampWalk(
      d,
      [
        [1280, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 3200],
        [3600, 1600],
        [1920, 1120],
        [2560, 1280],
        [3200, 1440],
        [4000, 1200],
        [1760, 2400],
        [2880, 2560],
        [3840, 2320],
        [2240, 2880],
        [3360, 2880],
        [1120, 2560],
      ],
      2,
    );
    return d;
  },
  intersection_district: () => {
    const d = base(1);
    border(d, 4);
    // Cross of roads through the rift plaza
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);
    gate(d, 38, H - 2, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Outer ring avenues
    rect(d, 10, 10, 60, 3, 2);
    rect(d, 10, 43, 60, 3, 2);
    rect(d, 10, 10, 3, 36, 2);
    rect(d, 67, 10, 3, 36, 2);

    // Central plaza
    rect(d, 30, 20, 20, 16, 2);

    // Anomaly pools (water tiles as glowing rifts)
    rect(d, 20, 18, 6, 5, 3);
    rect(d, 54, 33, 6, 5, 3);
    rect(d, 48, 14, 5, 4, 3);
    rect(d, 26, 36, 5, 4, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 320],
        [2560, 3280],
        [2560, 1792],
        [4160, 1680],
        [1600, 1120],
        [2080, 1440],
        [3200, 1200],
        [3840, 1520],
        [1760, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1600, 1920],
      ],
      2,
    );
    return d;
  },
  signal_block: () => {
    const d = base(1);
    border(d, 4);
    // West → intersection, east stub, north tower
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    // Main avenues
    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);
    rect(d, 12, 12, 56, 3, 2);
    rect(d, 12, 40, 56, 3, 2);
    rect(d, 12, 12, 3, 31, 2);
    rect(d, 65, 12, 3, 31, 2);

    // Transmitter plaza
    rect(d, 28, 18, 24, 18, 2);

    // Side alleys
    rect(d, 20, 18, 3, 20, 2);
    rect(d, 57, 18, 3, 20, 2);

    // Static rift pools
    rect(d, 16, 16, 5, 4, 3);
    rect(d, 58, 34, 5, 4, 3);
    rect(d, 44, 14, 6, 4, 3);
    rect(d, 28, 36, 6, 4, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 400],
        [2560, 1792],
        [1600, 1120],
        [2080, 1440],
        [3200, 1200],
        [3840, 1520],
        [1760, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1600, 1920],
        [2080, 1280],
        [3040, 1280],
        [2080, 2304],
        [3040, 2304],
      ],
      2,
    );
    return d;
  },
  relay_spire: () => {
    const d = base(1);
    border(d, 4);
    // West → signal_block, east stub, north spire tip
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    // Cross + ring around the spire base
    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);
    rect(d, 14, 14, 52, 3, 2);
    rect(d, 14, 39, 52, 3, 2);
    rect(d, 14, 14, 3, 28, 2);
    rect(d, 63, 14, 3, 28, 2);

    // Spire plaza (elevated pad)
    rect(d, 30, 18, 20, 18, 2);
    // Inner walk ring
    rect(d, 34, 22, 12, 10, 2);

    // Echo pools
    rect(d, 18, 18, 5, 4, 3);
    rect(d, 56, 32, 5, 4, 3);
    rect(d, 46, 16, 6, 3, 3);
    rect(d, 26, 36, 6, 3, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 480],
        [2560, 1792],
        [1600, 1120],
        [2080, 1440],
        [3200, 1200],
        [3840, 1520],
        [1760, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1600, 1920],
        [2080, 1280],
        [3040, 1280],
        [2080, 2304],
        [3040, 2304],
      ],
      2,
    );
    return d;
  },
  static_core: () => {
    const d = base(1);
    border(d, 4);
    // West → relay_spire, east stub toward distortion
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Concentric rings around the core
    rect(d, 16, 12, 48, 3, 2);
    rect(d, 16, 41, 48, 3, 2);
    rect(d, 16, 12, 3, 32, 2);
    rect(d, 61, 12, 3, 32, 2);

    rect(d, 24, 18, 32, 3, 2);
    rect(d, 24, 35, 32, 3, 2);
    rect(d, 24, 18, 3, 20, 2);
    rect(d, 53, 18, 3, 20, 2);

    // Core arena
    rect(d, 32, 22, 16, 12, 2);

    // Static pools
    rect(d, 18, 20, 5, 4, 3);
    rect(d, 56, 30, 5, 4, 3);
    rect(d, 30, 14, 6, 3, 3);
    rect(d, 44, 38, 6, 3, 3);
    rect(d, 36, 26, 8, 6, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 560],
        [2560, 1792],
        [1440, 1120],
        [2080, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3360, 2480],
        [4000, 2200],
        [1280, 2560],
      ],
      2,
    );
    return d;
  },
  chaos_sector: () => {
    const d = base(1);
    border(d, 4);
    // West → static_core, east deeper chaos stub, north fold
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    // Broken grid — offset roads
    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);
    rect(d, 10, 12, 28, 3, 2);
    rect(d, 42, 40, 28, 3, 2);
    rect(d, 12, 18, 3, 22, 2);
    rect(d, 64, 16, 3, 24, 2);

    // Warp plazas
    rect(d, 28, 18, 24, 16, 2);
    rect(d, 18, 30, 14, 8, 2);
    rect(d, 48, 14, 14, 8, 2);

    // Distortion pools
    rect(d, 16, 16, 6, 5, 3);
    rect(d, 54, 34, 6, 5, 3);
    rect(d, 34, 14, 5, 4, 3);
    rect(d, 40, 36, 5, 4, 3);
    rect(d, 24, 38, 4, 3, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 480],
        [2560, 1792],
        [1280, 1680],
        [1760, 1120],
        [2400, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1920, 1920],
        [1920, 1280],
        [2880, 1280],
        [1920, 2304],
        [2880, 2304],
        [2400, 1792],
        [2720, 1792],
      ],
      2,
    );
    return d;
  },
  fracture_ridge: () => {
    const d = base(1);
    border(d, 4);
    // West → chaos_sector, east stub, north tip
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    // Ridge spine + cross trails
    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);
    rect(d, 12, 14, 56, 3, 2);
    rect(d, 12, 38, 56, 3, 2);
    rect(d, 18, 14, 3, 28, 2);
    rect(d, 58, 14, 3, 28, 2);

    // Crest plateau
    rect(d, 28, 18, 24, 16, 2);
    rect(d, 32, 22, 16, 10, 2);

    // Fracture pools
    rect(d, 14, 18, 5, 4, 3);
    rect(d, 60, 32, 5, 4, 3);
    rect(d, 30, 14, 6, 3, 3);
    rect(d, 44, 38, 6, 3, 3);
    rect(d, 36, 28, 8, 4, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 480],
        [2560, 1792],
        [1760, 1120],
        [2400, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1920, 1920],
        [1920, 1280],
        [2880, 1280],
        [1920, 2304],
        [2880, 2304],
      ],
      2,
    );
    return d;
  },
  void_scar: () => {
    const d = base(1);
    border(d, 4);
    // West → fracture_ridge, east collapse stub, north pit
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Scar canyon rings
    rect(d, 14, 12, 52, 3, 2);
    rect(d, 14, 41, 52, 3, 2);
    rect(d, 14, 12, 3, 32, 2);
    rect(d, 63, 12, 3, 32, 2);

    rect(d, 22, 18, 36, 3, 2);
    rect(d, 22, 35, 36, 3, 2);
    rect(d, 22, 18, 3, 20, 2);
    rect(d, 55, 18, 3, 20, 2);

    // Leviathan arena
    rect(d, 30, 20, 20, 16, 2);

    // Void pools
    rect(d, 16, 20, 5, 5, 3);
    rect(d, 58, 30, 5, 5, 3);
    rect(d, 32, 14, 6, 3, 3);
    rect(d, 42, 38, 6, 3, 3);
    rect(d, 34, 24, 12, 8, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 560],
        [2560, 1792],
        [1440, 1120],
        [2080, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3360, 2480],
        [4000, 2200],
        [1280, 2560],
      ],
      2,
    );
    return d;
  },
  collapse_fringe: () => {
    const d = base(1);
    border(d, 4);
    // West → void_scar, east citadel stub, north ruin horizon
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Broken avenues
    rect(d, 10, 12, 30, 3, 2);
    rect(d, 40, 40, 30, 3, 2);
    rect(d, 12, 16, 3, 24, 2);
    rect(d, 64, 14, 3, 26, 2);

    // Ruin plazas
    rect(d, 26, 18, 28, 16, 2);
    rect(d, 16, 30, 16, 8, 2);
    rect(d, 48, 14, 16, 8, 2);

    // Collapse pools
    rect(d, 14, 16, 6, 5, 3);
    rect(d, 56, 34, 6, 5, 3);
    rect(d, 34, 14, 5, 4, 3);
    rect(d, 40, 36, 5, 4, 3);
    rect(d, 28, 24, 8, 6, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 480],
        [2560, 1792],
        [1280, 1680],
        [1760, 1120],
        [2400, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1920, 1920],
        [1920, 1280],
        [2880, 1280],
        [1920, 2304],
        [2880, 2304],
        [2400, 1792],
        [2720, 1792],
      ],
      2,
    );
    return d;
  },
  citadel_approach: () => {
    const d = base(1);
    border(d, 4);
    // West → collapse_fringe, east citadel stub, north walls
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Siege road + flanks
    rect(d, 12, 14, 56, 3, 2);
    rect(d, 12, 38, 56, 3, 2);
    rect(d, 18, 14, 3, 28, 2);
    rect(d, 58, 14, 3, 28, 2);

    // Approach plaza before walls
    rect(d, 28, 18, 24, 16, 2);
    rect(d, 32, 22, 16, 10, 2);

    // Entropy pools
    rect(d, 14, 18, 5, 4, 3);
    rect(d, 60, 32, 5, 4, 3);
    rect(d, 30, 14, 6, 3, 3);
    rect(d, 44, 38, 6, 3, 3);
    rect(d, 36, 28, 8, 4, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 480],
        [2560, 1792],
        [1760, 1120],
        [2400, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1920, 1920],
        [1920, 1280],
        [2880, 1280],
        [1920, 2304],
        [2880, 2304],
      ],
      2,
    );
    return d;
  },
  singularity_citadel: () => {
    const d = base(1);
    border(d, 4);
    // West → citadel_approach, east gods_rift stub, north throne
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Concentric halls
    rect(d, 14, 12, 52, 3, 2);
    rect(d, 14, 41, 52, 3, 2);
    rect(d, 14, 12, 3, 32, 2);
    rect(d, 63, 12, 3, 32, 2);

    rect(d, 22, 18, 36, 3, 2);
    rect(d, 22, 35, 36, 3, 2);
    rect(d, 22, 18, 3, 20, 2);
    rect(d, 55, 18, 3, 20, 2);

    // Throne arena
    rect(d, 30, 20, 20, 16, 2);

    // Singularity pools
    rect(d, 16, 20, 5, 5, 3);
    rect(d, 58, 30, 5, 5, 3);
    rect(d, 32, 14, 6, 3, 3);
    rect(d, 42, 38, 6, 3, 3);
    rect(d, 34, 24, 12, 8, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 560],
        [2560, 1792],
        [1440, 1120],
        [2080, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3360, 2480],
        [4000, 2200],
        [1280, 2560],
      ],
      2,
    );
    return d;
  },
  gods_rift: () => {
    const d = base(1);
    border(d, 4);
    // West → singularity_citadel, east pantheon stub, north golden rift
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Cracked temple avenues
    rect(d, 12, 14, 56, 3, 2);
    rect(d, 12, 38, 56, 3, 2);
    rect(d, 18, 14, 3, 28, 2);
    rect(d, 58, 14, 3, 28, 2);

    // Central rift plaza
    rect(d, 28, 18, 24, 16, 2);
    rect(d, 32, 22, 16, 10, 2);

    // Divine pools (gold-tinted water tiles)
    rect(d, 14, 18, 5, 4, 3);
    rect(d, 60, 32, 5, 4, 3);
    rect(d, 30, 14, 6, 3, 3);
    rect(d, 44, 38, 6, 3, 3);
    rect(d, 36, 28, 8, 4, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 480],
        [2560, 1792],
        [1280, 1680],
        [1760, 1120],
        [2400, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1920, 1920],
        [1920, 1280],
        [2880, 1280],
        [1920, 2304],
        [2880, 2304],
        [2400, 1792],
        [2720, 1792],
      ],
      2,
    );
    return d;
  },
  pantheon_ascent: () => {
    const d = base(1);
    border(d, 4);
    // West → gods_rift, east godfall stub, north temple steps
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Ascending terraces
    rect(d, 12, 14, 56, 3, 2);
    rect(d, 12, 38, 56, 3, 2);
    rect(d, 18, 14, 3, 28, 2);
    rect(d, 58, 14, 3, 28, 2);

    // Mid terrace plaza
    rect(d, 28, 18, 24, 16, 2);
    rect(d, 32, 22, 16, 10, 2);

    // Stepped platforms
    rect(d, 24, 16, 32, 2, 2);
    rect(d, 28, 12, 24, 2, 2);

    // Ichor pools
    rect(d, 14, 18, 5, 4, 3);
    rect(d, 60, 32, 5, 4, 3);
    rect(d, 30, 14, 6, 3, 3);
    rect(d, 44, 38, 6, 3, 3);
    rect(d, 36, 28, 8, 4, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 480],
        [2560, 1792],
        [1760, 1120],
        [2400, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3040, 2480],
        [4000, 2320],
        [1280, 2560],
        [2560, 1120],
        [2560, 2560],
        [3520, 1920],
        [1920, 1920],
        [1920, 1280],
        [2880, 1280],
        [1920, 2304],
        [2880, 2304],
      ],
      2,
    );
    return d;
  },
  godfall_throne: () => {
    const d = base(1);
    border(d, 4);
    // West → pantheon_ascent, east horizon stub, north empty throne
    gate(d, 0, 26, 2, 4, 2);
    gate(d, W - 2, 26, 2, 4, 2);
    gate(d, 38, 0, 4, 2, 2);

    rect(d, 1, 26, W - 2, 4, 2);
    rect(d, 37, 1, 6, H - 2, 2);

    // Concentric halls
    rect(d, 14, 12, 52, 3, 2);
    rect(d, 14, 41, 52, 3, 2);
    rect(d, 14, 12, 3, 32, 2);
    rect(d, 63, 12, 3, 32, 2);

    rect(d, 22, 18, 36, 3, 2);
    rect(d, 22, 35, 36, 3, 2);
    rect(d, 22, 18, 3, 20, 2);
    rect(d, 55, 18, 3, 20, 2);

    // Throne arena
    rect(d, 30, 20, 20, 16, 2);

    // Divine ichor pools
    rect(d, 16, 20, 5, 5, 3);
    rect(d, 58, 30, 5, 5, 3);
    rect(d, 32, 14, 6, 3, 3);
    rect(d, 42, 38, 6, 3, 3);
    rect(d, 34, 24, 12, 8, 3);

    stampWalk(
      d,
      [
        [960, 1920],
        [320, 1792],
        [4800, 1792],
        [2560, 560],
        [2560, 1792],
        [1440, 1120],
        [2080, 1440],
        [3200, 1200],
        [3840, 1520],
        [1600, 2400],
        [3360, 2480],
        [4000, 2200],
        [1280, 2560],
      ],
      2,
    );
    return d;
  },
};

function toTiled(id, data, width = W, height = H) {
  return {
    compressionlevel: -1,
    height,
    infinite: false,
    layers: [
      {
        data,
        height,
        id: 1,
        name: 'ground',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 2,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 64,
    tilesets: [
      {
        columns: 8,
        firstgid: 1,
        image: 'tileset.png',
        imageheight: 64,
        imagewidth: 512,
        margin: 0,
        name: 'terrain',
        spacing: 0,
        tilecount: 8,
        tileheight: 64,
        tilewidth: 64,
      },
    ],
    tilewidth: 64,
    type: 'map',
    version: '1.10',
    width,
  };
}

const MAP_SIZE = {
  empery_hq_lobby: { w:EMPERY_HQ_LOBBY.width, h:EMPERY_HQ_LOBBY.height },
  empery_hq: { w: 40, h: 32 },
  empery_haven: { w: HAVEN_W, h: HAVEN_H },
};

const only = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
if (only?.some(id=>!Object.hasOwn(maps,id))) throw new Error('Unknown map in --only');
const selected = id => !only || only.includes(id);
const outDir = join(root, 'apps/client/public/maps');
for (const [id, build] of Object.entries(maps)) {
  if (!selected(id)) continue;
  const path = join(outDir, `${id}.json`);
  const size = MAP_SIZE[id] ?? { w: W, h: H };
  const data = build();
  writeFileSync(path, `${JSON.stringify(toTiled(id, data, size.w, size.h), null, 2)}\n`);
  console.log('wrote', path, `${size.w}×${size.h} tiles (${size.w * TW}×${size.h * TW}px)`);
}

// Клиентский декор + YAML координаты из того же плана города
if (selected('empery_haven')) {
const havenDecorPath = join(root, 'packages/shared/src/haven-city-data.ts');
let props = havenPropPlacements();
if (existsSync(HAVEN_PROP_OVERRIDE_PATH)) {
  const override = JSON.parse(readFileSync(HAVEN_PROP_OVERRIDE_PATH, 'utf8'));
  if (!Array.isArray(override.placements)) {
    throw new Error('Haven prop override must contain placements[]');
  }
  props = override.placements.map((row, index) => {
    if (
      !Array.isArray(row) ||
      row.length !== 5 ||
      typeof row[0] !== 'string' ||
      !/^prop_[a-z0-9_]+$/.test(row[0]) ||
      row.slice(1).some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new Error(`Invalid Haven prop override row ${index}`);
    }
    const [id, x, y, size, depth] = row;
    const maxX = HAVEN_W * TW;
    const maxY = HAVEN_H * TW;
    if (x < 0 || x > maxX || y < 0 || y > maxY || size < 16 || size > 1024) {
      throw new Error(`Haven prop override row ${index} is outside allowed bounds`);
    }
    return [id, Math.round(x), Math.round(y), Math.round(size), Math.round(depth)];
  });
  console.log('using Haven prop editor override', HAVEN_PROP_OVERRIDE_PATH, `(${props.length} props)`);
}
const [bannerX, bannerY] = [40 * TW + TW / 2, 8 * TW + TW / 2];
writeFileSync(
  havenDecorPath,
  `/* AUTO-GENERATED by scripts/generate-maps.mjs — do not edit by hand. */\n` +
    `export const HAVEN_CITY_BANNER = { x: ${bannerX}, y: ${bannerY}, text: '⚔ ${HAVEN.name} ⚔' } as const;\n` +
    `export const HAVEN_CITY_PROPS: ReadonlyArray<readonly [string, number, number, number, number]> = ${JSON.stringify(props, null, 2)};\n`,
);
console.log('wrote', havenDecorPath, `(${props.length} props)`);

const havenYamlPath = join(root, 'content/locations/empery_haven.yaml');
writeFileSync(
  havenYamlPath,
  `id: empery_haven
name: ${HAVEN.name}
subtitle: ${HAVEN.subtitle}
description: Безопасный город у воды — рынок, трактир и капитан стражи. Здесь можно отдохнуть, закупиться и узнать новости.
mapKey: map-empery_haven
backgroundAsset: location_empery_haven
safeZone: true
anomalyTier: 1
tierLabel: Зона Стабильности
recommendedLevel:
  min: 1
  max: 25
${havenYamlFragment()}
`,
);
console.log('wrote', havenYamlPath);
// HAVEN_NPC_POSTS in packages/shared must match HAVEN.npcs (lock: haven-npc-posts-sync.test.ts)

}

// EmperyWorld HQ — props + YAML
if (selected('empery_hq')) {
const hqDecorPath = join(root, 'packages/shared/src/empery-hq-data.ts');
writeFileSync(
  hqDecorPath,
  `/* AUTO-GENERATED by scripts/generate-maps.mjs — do not edit by hand. */\n` +
    `export const EMPERY_HQ_PROPS: ReadonlyArray<readonly [string, number, number, number]> = ${JSON.stringify(EMPERY_HQ.props, null, 2)};\n`,
);
console.log('wrote', hqDecorPath, `(${EMPERY_HQ.props.length} props)`);

const hqYamlPath = join(root, 'content/locations/empery_hq.yaml');
const hqZonesYaml = EMPERY_HQ.zones
  .map((z) => {
    let s = `  - x: ${z.x}\n    y: ${z.y}\n    label: '${z.label}'\n    color: '${z.color}'`;
    if (z.travelTo) s += `\n    travelTo: ${z.travelTo}\n    radius: ${z.radius ?? 120}`;
    if (z.arrival) s += `\n    arrival: { x: ${z.arrival.x}, y: ${z.arrival.y} }`;
    return s;
  })
  .join('\n');
const hqNpcsYaml = (EMPERY_HQ.npcs ?? [])
  .map(
    (n) =>
      `  - id: ${n.id}\n    x: ${n.x}\n    y: ${n.y}\n    label: ${n.label}`,
  )
  .join('\n');
writeFileSync(
  hqYamlPath,
  `id: empery_hq
name: ${EMPERY_HQ.name}
subtitle: ${EMPERY_HQ.subtitle}
description: Закрытый кампус EmperyWorld. Приёмная находится внутри главного корпуса; лаборатории и серверное крыло выходят во двор.
mapKey: map-empery_hq
backgroundAsset: location_empery_hq
safeZone: true
anomalyTier: 1
tierLabel: Зона Допуска
dayNight: outdoor
recommendedLevel:
  min: 1
  max: 99
requires:
  anyFlag: [quest_empery_hq_access]
  denyMessage: Ворота EmperyWorld закрыты. Нужен допуск героя — квест ещё впереди.
spawn:
  x: ${EMPERY_HQ.spawn[0]}
  y: ${EMPERY_HQ.spawn[1]}
npcs:
${hqNpcsYaml || '  []'}
zones:
${hqZonesYaml}
landmarks: []
enemies: []
`,
);
console.log('wrote', hqYamlPath);

}

if(selected('empery_hq_lobby')) {
  const lobbyPath=join(root,'content/locations/empery_hq_lobby.yaml');
  const npcRows=EMPERY_HQ_LOBBY_NPCS.map(n=>`  - id: ${n.id}\n    x: ${n.x}\n    y: ${n.y}\n    label: ${n.label}`).join('\n');
  const {spawn,exit}=EMPERY_HQ_LOBBY;
  const lobbySource=readFileSync(lobbyPath,'utf8').replace(/spawn: [^\n]+/,`spawn: {x: ${spawn.x}, y: ${spawn.y}}`).replace(/\nzones:\n[\s\S]*?\nlandmarks:/,`\nzones:\n  - x: ${exit.x}\n    y: ${exit.y}\n    label: '↓ Двор кампуса'\n    color: '#b79d6d'\n    travelTo: empery_hq\n    radius: 88\n    arrival: {x: ${spawn.x}, y: ${spawn.y}}\nlandmarks:`);
  const lobbyYaml=lobbySource.replace(/\nnpcs:\n[\s\S]*?\nzones:\n/,`\nnpcs:\n${npcRows}\nzones:\n`);
  writeFileSync(lobbyPath,lobbyYaml);
}

const stampHash = createHash('sha1');
for (const name of readdirSync(outDir)
  .filter((n) => n.endsWith('.json'))
  .sort()) {
  stampHash.update(readFileSync(join(outDir, name)));
}
const mapsStamp = stampHash.digest('hex').slice(0, 12);
writeFileSync(
  join(root, 'apps/client/src/game/maps-stamp.ts'),
  `/** Bumped by \`scripts/generate-maps.mjs\` so Phaser/HTTP cache does not keep a stale Tiled JSON. */\n` +
    `export const MAPS_STAMP = '${mapsStamp}';\n\n` +
    `export function mapJsonUrl(mapKey: string, stamp = MAPS_STAMP): string {\n` +
    `  const id = mapKey.replace(/^map-/, '');\n` +
    `  return \`/maps/\${id}.json?v=\${encodeURIComponent(stamp)}\`;\n` +
    `}\n`,
);
console.log('wrote maps-stamp', mapsStamp);

