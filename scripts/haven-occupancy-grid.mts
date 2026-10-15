/** Ad-hoc ASCII occupancy grid for a tile box — used to find genuinely free
 * pockets when hand-placing decor (packer keeps silently scattering items
 * that collide with landmark exclusion padding). Not part of the pipeline. */
import {
  HAVEN,
  HAVEN_NPC_LANDMARK_EXCLUSIONS,
  havenPropPlacements,
} from './layouts/empery_haven.mjs';

const TW = 64;

function footprint(x: number, y: number, size: number) {
  const w = size * 0.72;
  const h = size * 0.62;
  const cy = y - size * 0.08;
  return { L: x - w / 2, R: x + w / 2, T: cy - h / 2, B: cy + h / 2 };
}

const args = process.argv.slice(2).map(Number);
const [tx0, ty0, tx1, ty1] = args.length === 4 ? args : [0, 0, 26, 17];

const boxes: Array<{ L: number; R: number; T: number; B: number; label: string }> = [];
for (const lm of HAVEN_NPC_LANDMARK_EXCLUSIONS) {
  const f = footprint(lm.x, lm.y, lm.size);
  boxes.push({ L: f.L - TW, R: f.R + TW, T: f.T - TW, B: f.B + TW, label: lm.prop });
}
const c = (tx: number, ty: number): [number, number] => [tx * TW + TW / 2, ty * TW + TW / 2];
for (const [id, tx, ty, size] of HAVEN.buildings) {
  if (Number(size) < 100) continue;
  const [x, y] = c(Number(tx), Number(ty));
  const f = footprint(x, y, Number(size));
  boxes.push({ ...f, label: id });
}
for (const [id, tx, ty, size] of HAVEN.complexes) {
  if (Number(size) < 100) continue;
  const [x, y] = c(Number(tx), Number(ty));
  const f = footprint(x, y, Number(size));
  boxes.push({ ...f, label: id });
}

function labelAt(tx: number, ty: number): string | null {
  const px = tx * TW + TW / 2;
  const py = ty * TW + TW / 2;
  for (const b of boxes) {
    if (px > b.L && px < b.R && py > b.T && py < b.B) return b.label;
  }
  return null;
}

const legend = new Map<string, string>();
let nextChar = 65;
for (let ty = ty0; ty <= ty1; ty += 1) {
  let row = '';
  for (let tx = tx0; tx <= tx1; tx += 1) {
    const l = labelAt(tx, ty);
    if (!l) {
      row += '.';
      continue;
    }
    if (!legend.has(l)) legend.set(l, String.fromCharCode(nextChar++));
    row += legend.get(l);
  }
  console.log(`${String(ty).padStart(2, ' ')} ${row}`);
}
console.log('legend:', [...legend.entries()].map(([k, v]) => `${v}=${k}`).join(' '));
void havenPropPlacements;
