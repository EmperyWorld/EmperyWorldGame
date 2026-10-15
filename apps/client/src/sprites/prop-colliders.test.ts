import { describe, expect, it } from 'vitest';
import { footprintForProp, shouldForcePropAabb } from './prop-footprint.js';
import { cityGatePillarBoxes } from './prop-colliders.js';
import { propColliderMode } from './prop-layer.js';
import {
  behindOcclusionStrip,
  silhouetteColliderBoxes,
  type PropOpaqueNorm,
  PROP_SPRITE_ORIGIN_Y,
} from './prop-silhouette-math.js';

/** Typical house_stone WebP alpha bbox (256², origin 0.72) + diamond-ish bands. */
const HOUSE_OPAQUE: PropOpaqueNorm = {
  minX: 0.22,
  minY: 0.16,
  maxX: 0.78,
  maxY: 0.79,
  footMinX: 0.24,
  footMaxX: 0.77,
  footMinY: 0.55,
  footMaxY: 0.79,
  bands: [
    { minX: 0.28, maxX: 0.72, y: 0.32, h: 0.07 },
    { minX: 0.24, maxX: 0.76, y: 0.4, h: 0.07 },
    { minX: 0.22, maxX: 0.78, y: 0.48, h: 0.07 },
    { minX: 0.25, maxX: 0.75, y: 0.54, h: 0.06 },
    { minX: 0.3, maxX: 0.7, y: 0.58, h: 0.05 },
    { minX: 0.28, maxX: 0.72, y: 0.66, h: 0.05 },
    { minX: 0.26, maxX: 0.74, y: 0.72, h: 0.05 },
  ],
};

describe('layer modes (not one-size AABB)', () => {
  it('keeps façades / stalls / arches on silhouette modes', () => {
    expect(propColliderMode('prop_house_stone')).toBe('behind');
    expect(propColliderMode('prop_inn')).toBe('behind');
    expect(propColliderMode('prop_tenement_block')).toBe('behind');
    expect(propColliderMode('prop_market_canopy')).toBe('stall');
    expect(propColliderMode('prop_forum_arch')).toBe('arch');
    expect(propColliderMode('prop_tree_oak')).toBe('trunk');
    expect(propColliderMode('prop_fountain')).toBe('flat');
  });

  it('force-AABB only indoor furniture — never houses or landmarks', () => {
    expect(shouldForcePropAabb('prop_russian_stove')).toBe(true);
    expect(shouldForcePropAabb('prop_apt_bed')).toBe(true);
    expect(shouldForcePropAabb('prop_house_stone')).toBe(false);
    expect(shouldForcePropAabb('prop_inn')).toBe(false);
    expect(shouldForcePropAabb('prop_tenement_block')).toBe(false);
    expect(shouldForcePropAabb('prop_shop_front')).toBe(false);
    expect(shouldForcePropAabb('prop_market_canopy')).toBe(false);
  });
});

describe('silhouetteColliderBoxes behind apron', () => {
  it('leaves a thin eaves apron; solid mass reaches near opaque south', () => {
    const size = 124;
    const boxes = silhouetteColliderBoxes(0, 0, size, HOUSE_OPAQUE, 'behind');
    expect(boxes.length).toBeGreaterThanOrEqual(2);

    const bottom = (HOUSE_OPAQUE.maxY - PROP_SPRITE_ORIGIN_Y) * size;
    const top = (HOUSE_OPAQUE.minY - PROP_SPRITE_ORIGIN_Y) * size;
    const oh = bottom - top;
    const { apron } = behindOcclusionStrip(oh, 'mass');
    expect(apron).toBeLessThanOrEqual(16);
    const apronNorth = bottom - apron;

    let southMost = -Infinity;
    for (const b of boxes) {
      const boxBottom = b.cy + b.bh / 2;
      expect(boxBottom).toBeLessThanOrEqual(apronNorth + 0.6);
      southMost = Math.max(southMost, boxBottom);
    }
    // Physics sits low enough that you cannot walk under the facade.
    expect(southMost).toBeGreaterThan(bottom - apron - 2);
    expect(southMost).toBeGreaterThan(bottom - 18);
    const covered = boxes.reduce((s, b) => s + b.bh, 0);
    expect(covered).toBeGreaterThan(oh * 0.35);
  });

  it('uses varying band widths instead of one fat square (diamond / isometric)', () => {
    const size = 124;
    const boxes = silhouetteColliderBoxes(0, 0, size, HOUSE_OPAQUE, 'behind');
    const widths = boxes.map((b) => b.bw);
    const minW = Math.min(...widths);
    const maxW = Math.max(...widths);
    expect(maxW - minW).toBeGreaterThan(size * 0.05);
    expect(boxes.length).toBeGreaterThanOrEqual(3);
  });

  it('stall keeps a deeper counter apron than façades', () => {
    const size = 138;
    const stallOpaque: PropOpaqueNorm = {
      minX: 0.1,
      minY: 0.05,
      maxX: 0.89,
      maxY: 0.84,
      footMinX: 0.12,
      footMaxX: 0.88,
      footMinY: 0.5,
      footMaxY: 0.84,
      bands: [],
    };
    const bottom = (stallOpaque.maxY - PROP_SPRITE_ORIGIN_Y) * size;
    const top = (stallOpaque.minY - PROP_SPRITE_ORIGIN_Y) * size;
    const oh = bottom - top;
    const stallApron = behindOcclusionStrip(oh, 'stall').apron;
    const massApron = behindOcclusionStrip(oh, 'mass').apron;
    expect(stallApron).toBeGreaterThan(massApron);

    const boxes = silhouetteColliderBoxes(0, 0, size, stallOpaque, 'stall');
    const apronNorth = bottom - stallApron;
    for (const b of boxes) {
      expect(b.cy + b.bh / 2).toBeLessThanOrEqual(apronNorth + 0.6);
    }
  });

  it('arch sort inset is deep enough that walkers draw above the lintel', () => {
    const { apron, sortInset } = behindOcclusionStrip(200, 'arch');
    expect(sortInset).toBeGreaterThanOrEqual(apron * 0.8);
    expect(sortInset).toBeGreaterThan(200 * 0.35);
  });

  it('arch emits two pillars with an open center', () => {
    const opaque: PropOpaqueNorm = {
      minX: 0.1,
      minY: 0.1,
      maxX: 0.9,
      maxY: 0.85,
      footMinX: 0.12,
      footMaxX: 0.88,
      footMinY: 0.55,
      footMaxY: 0.85,
      bands: [],
    };
    const boxes = silhouetteColliderBoxes(0, 0, 150, opaque, 'arch');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.cx).toBeLessThan(boxes[1]!.cx);
    const gap = boxes[1]!.cx - boxes[1]!.bw / 2 - (boxes[0]!.cx + boxes[0]!.bw / 2);
    expect(gap).toBeGreaterThan(40);
  });
});

describe('footprintForProp mode fallbacks', () => {
  it('behind fallback is a wall strip, not a full landmark square', () => {
    const fp = footprintForProp('prop_house_stone', 124)!;
    expect(fp.oy).toBeLessThan(-0.18);
    expect(fp.oy).toBeGreaterThan(-0.34);
    expect(fp.h).toBeLessThan(0.5);
    expect(fp.h).toBeGreaterThan(0.3);
  });

  it('returns null for decorative pass props', () => {
    expect(footprintForProp('prop_banner_pole', 64)).toBeNull();
    expect(footprintForProp('prop_hq_pad', 150)).toBeNull();
    expect(footprintForProp('prop_city_wall_n', 148)).toBeNull();
  });

  it('keeps city gate footprints as solid mass (jambs come from cityGatePillarBoxes)', () => {
    const fp = footprintForProp('prop_city_gate_s', 240);
    expect(fp).not.toBeNull();
    expect(fp!.w).toBeGreaterThan(0.5);
    expect(propColliderMode('prop_city_gate_s')).toBe('behind');
  });

  it('places NS gate pillars with a sealed door leaf when closed', () => {
    const boxes = cityGatePillarBoxes('prop_city_gate', 2592, 160, 240);
    expect(boxes).toHaveLength(3);
    const left = boxes.find((b) => b.cx < 2592)!;
    const right = boxes.find((b) => b.cx > 2592)!;
    const leaf = boxes.find((b) => Math.abs(b.cx - 2592) < 1)!;
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(leaf.bw).toBeGreaterThan(20);
    expect(left.bw).toBeGreaterThan(70);
  });

  it('places east gate pillars on the north/south jambs when closed', () => {
    const boxes = cityGatePillarBoxes('prop_city_gate_e', 4960, 1824, 220);
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => Math.abs(b.cx - 4960) < 1)).toBe(true);
  });

  it('classifies city gates as behind (solid mass), not open arches', () => {
    expect(propColliderMode('prop_city_gate')).toBe('behind');
    expect(propColliderMode('prop_city_gate_e')).toBe('behind');
  });

  it('keeps amphitheatre stage collidable', () => {
    const fp = footprintForProp('prop_open_stage', 380);
    expect(fp).not.toBeNull();
    expect(fp!.w).toBeGreaterThan(0.5);
    expect(fp!.h).toBeGreaterThan(0.3);
  });
});
