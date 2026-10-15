/**
 * Pure silhouette → collider math (no Phaser). Safe for unit tests.
 * Sampling textures lives in prop-silhouette.ts.
 */
export const PROP_SPRITE_ORIGIN_Y = 0.72;

/** One horizontal slice of opaque pixels (normalized 0–1). */
export interface PropOpaqueBand {
  minX: number;
  maxX: number;
  /** Band center Y in texture space. */
  y: number;
  /** Band height in texture space. */
  h: number;
}

/** Opaque AABB in normalized texture space (0–1), matching display square. */
export interface PropOpaqueNorm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Ground-contact band (lower opaque rows) — tighter width for roofs/canopies. */
  footMinX: number;
  footMaxX: number;
  footMinY: number;
  footMaxY: number;
  /**
   * Horizontal opaque spans — follow diamond / isometric façades.
   * Arcade can't rotate boxes; stacked AABBs of varying width approximate the footprint.
   */
  bands: PropOpaqueBand[];
}

export type SilhouetteColliderMode = 'behind' | 'flat' | 'trunk' | 'arch' | 'stall';

/**
 * South walk-behind / counter strip must fit the player body (~28px circle).
 * Stalls keep a deep open front; façades keep a thin eaves strip — too deep and
 * you walk under the wall from the south.
 */
export function behindOcclusionStrip(
  opaqueHeight: number,
  profile: 'mass' | 'stall' | 'arch' = 'mass',
): {
  apron: number;
  sortInset: number;
} {
  const oh = Math.max(1, opaqueHeight);
  if (profile === 'stall') {
    const apron = Math.max(48, Math.min(oh * 0.48, oh * 0.55));
    const sortInset = Math.max(6, Math.min(apron * 0.18, oh * 0.05));
    return { apron, sortInset };
  }
  if (profile === 'arch') {
    // Sort near mid-span so a player in the opening draws on top of lintel art
    // (south tip sort hid the avatar under the whole gate/arch sprite).
    const apron = Math.max(32, oh * 0.28);
    const sortInset = Math.max(apron * 0.95, oh * 0.52);
    return { apron, sortInset };
  }
  // Façade: thin south strip under eaves — foundation / lower wall stays solid.
  const apron = Math.max(10, Math.min(16, oh * 0.12));
  const sortInset = Math.max(4, Math.min(apron * 0.35, oh * 0.04));
  return { apron, sortInset };
}

/** World-space occlusion line near opaque south (paired with collider apron). */
export function opaqueSouthY(
  anchorY: number,
  displaySize: number,
  opaque: PropOpaqueNorm,
  originY = PROP_SPRITE_ORIGIN_Y,
  profile: 'mass' | 'stall' | 'arch' = 'mass',
): number {
  const bottom = anchorY + (opaque.maxY - originY) * displaySize;
  const top = anchorY + (opaque.minY - originY) * displaySize;
  const h = Math.max(1, bottom - top);
  const { sortInset } = behindOcclusionStrip(h, profile);
  return bottom - sortInset;
}

function worldBandBoxes(
  anchorX: number,
  anchorY: number,
  displaySize: number,
  opaque: PropOpaqueNorm,
  originY: number,
  solidBottom: number,
  solidTop: number,
  minBandW: number,
): Array<{ cx: number; cy: number; bw: number; bh: number }> {
  const out: Array<{ cx: number; cy: number; bw: number; bh: number }> = [];
  for (const band of opaque.bands) {
    const bandTop = anchorY + (band.y - band.h * 0.5 - originY) * displaySize;
    const bandBot = anchorY + (band.y + band.h * 0.5 - originY) * displaySize;
    const top = Math.max(bandTop, solidTop);
    const bot = Math.min(bandBot, solidBottom);
    const bh = bot - top;
    if (bh < 7) continue;
    const left = anchorX + (band.minX - 0.5) * displaySize;
    const right = anchorX + (band.maxX - 0.5) * displaySize;
    const bw = right - left;
    if (bw < minBandW) continue;
    out.push({
      cx: (left + right) * 0.5,
      cy: (top + bot) * 0.5,
      bw: Math.max(minBandW, bw),
      bh,
    });
  }
  return out;
}

/**
 * Arcade AABB(s) from opaque silhouette by layer mode.
 * Behind/stall prefer horizontal bands so diamond / isometric art isn't a fat square.
 */
export function silhouetteColliderBoxes(
  anchorX: number,
  anchorY: number,
  displaySize: number,
  opaque: PropOpaqueNorm,
  mode: SilhouetteColliderMode = 'behind',
  originY = PROP_SPRITE_ORIGIN_Y,
): Array<{ cx: number; cy: number; bw: number; bh: number }> {
  const left = anchorX + (opaque.minX - 0.5) * displaySize;
  const right = anchorX + (opaque.maxX - 0.5) * displaySize;
  const top = anchorY + (opaque.minY - originY) * displaySize;
  const bottom = anchorY + (opaque.maxY - originY) * displaySize;
  const ow = Math.max(1, right - left);
  const oh = Math.max(1, bottom - top);

  const footL = anchorX + (opaque.footMinX - 0.5) * displaySize;
  const footR = anchorX + (opaque.footMaxX - 0.5) * displaySize;
  const footW = Math.max(1, footR - footL);
  const footBottom = anchorY + (opaque.footMaxY - originY) * displaySize;
  const footTop = anchorY + (opaque.footMinY - originY) * displaySize;
  const footH = Math.max(1, footBottom - footTop);

  if (mode === 'flat') {
    return [
      {
        cx: (left + right) * 0.5,
        cy: (top + bottom) * 0.5,
        bw: Math.max(14, ow * 0.88),
        bh: Math.max(12, oh * 0.88),
      },
    ];
  }

  if (mode === 'trunk') {
    const apron = Math.max(28, oh * 0.22);
    const bodyW = Math.max(12, Math.min(footW * 0.55, ow * 0.28));
    const bodyH = Math.max(10, Math.min(footH * 0.7, oh * 0.2));
    const bodyBottom = bottom - apron;
    return [
      {
        cx: (footL + footR) * 0.5,
        cy: bodyBottom - bodyH * 0.5,
        bw: bodyW,
        bh: bodyH,
      },
    ];
  }

  if (mode === 'arch') {
    const { apron } = behindOcclusionStrip(oh, 'arch');
    const pillarW = Math.max(12, Math.min(footW * 0.2, ow * 0.18));
    const bodyH = Math.max(14, Math.min(footH * 0.9, oh * 0.28));
    const bodyBottom = bottom - apron * 0.55;
    const cy = bodyBottom - bodyH * 0.5;
    const inset = footW * 0.04;
    return [
      { cx: footL + inset + pillarW * 0.5, cy, bw: pillarW, bh: bodyH },
      { cx: footR - inset - pillarW * 0.5, cy, bw: pillarW, bh: bodyH },
    ];
  }

  if (mode === 'stall') {
    const { apron } = behindOcclusionStrip(oh, 'stall');
    const solidBottom = bottom - apron;
    const solidTop = top + Math.max(4, oh * 0.08);
    if (opaque.bands.length >= 2) {
      const banded = worldBandBoxes(
        anchorX,
        anchorY,
        displaySize,
        opaque,
        originY,
        solidBottom,
        solidTop,
        14,
      );
      if (banded.length > 0) return banded;
    }
    const usable = Math.max(12, solidBottom - top);
    const bodyH = Math.max(14, Math.min(usable * 0.7, oh * 0.28));
    const bodyW = Math.max(16, Math.min(footW * 0.95, ow * 0.85));
    return [
      {
        cx: (footL + footR) * 0.5,
        cy: solidBottom - bodyH * 0.5,
        bw: bodyW,
        bh: bodyH,
      },
    ];
  }

  // behind / mass — prefer per-row bands (diamond / isometric houses).
  const { apron } = behindOcclusionStrip(oh, 'mass');
  const solidBottom = bottom - apron;
  const roofInset = Math.max(4, oh * 0.08);
  const solidTop = top + roofInset;
  const footPadW = Math.max(18, Math.min(Math.max(footW, ow * 0.72) * 1.02, ow * 0.95));
  const footCx = (footL + footR) * 0.5;

  if (opaque.bands.length >= 2) {
    const banded = worldBandBoxes(
      anchorX,
      anchorY,
      displaySize,
      opaque,
      originY,
      solidBottom,
      solidTop,
      16,
    );
    if (banded.length > 0) {
      // Bands often stop mid-wall; seal the foundation down to the eaves apron.
      const southMost = Math.max(...banded.map((b) => b.cy + b.bh * 0.5));
      const gap = solidBottom - southMost;
      if (gap >= 8) {
        banded.push({
          cx: footCx,
          cy: southMost + gap * 0.5,
          bw: footPadW,
          bh: gap,
        });
      }
      return banded;
    }
  }

  // Fallback when bands missing (hand-built opaque in tests).
  const solidH = Math.max(16, solidBottom - solidTop);
  if (solidH >= 36) {
    const lowerH = Math.max(14, Math.min(solidH * 0.42, oh * 0.28));
    const upperH = Math.max(14, Math.min(solidH - lowerH - 2, oh * 0.38));
    return [
      { cx: footCx, cy: solidBottom - lowerH * 0.5, bw: footPadW, bh: lowerH },
      {
        cx: footCx,
        cy: solidBottom - lowerH - 2 - upperH * 0.5,
        bw: footPadW * 0.96,
        bh: upperH,
      },
    ];
  }
  return [{ cx: footCx, cy: solidBottom - solidH * 0.5, bw: footPadW, bh: solidH * 0.92 }];
}

/** @deprecated prefer silhouetteColliderBoxes */
export function silhouetteFootprintWorld(
  anchorX: number,
  anchorY: number,
  displaySize: number,
  opaque: PropOpaqueNorm,
  mode: SilhouetteColliderMode = 'behind',
  originY = PROP_SPRITE_ORIGIN_Y,
): { cx: number; cy: number; bw: number; bh: number } {
  return silhouetteColliderBoxes(anchorX, anchorY, displaySize, opaque, mode, originY)[0]!;
}

const BAND_COUNT = 7;

/** Build PropOpaqueNorm from raw ImageData (shared by runtime sampler + offline tools). */
export function boundsFromImageData(data: {width:number;height:number;data:ArrayLike<number>}, alphaCut = 36): PropOpaqueNorm | null {
  const { width: w, height: h, data: px } = data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! < alphaCut) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const padX = 0.5 / w;
  const padY = 0.5 / h;
  let nMinX = Math.max(0, minX / w - padX);
  let nMinY = Math.max(0, minY / h - padY);
  let nMaxX = Math.min(1, (maxX + 1) / w + padX);
  let nMaxY = Math.min(1, (maxY + 1) / h + padY);

  const area = (nMaxX - nMinX) * (nMaxY - nMinY);
  if (area < 0.02) return null;
  if (area > 0.96) {
    nMinX = Math.min(nMinX + 0.03, 0.45);
    nMinY = Math.min(nMinY + 0.03, 0.45);
    nMaxX = Math.max(nMaxX - 0.03, 0.55);
    nMaxY = Math.max(nMaxY - 0.03, 0.55);
  }

  const bandTop = nMinY + (nMaxY - nMinY) * 0.6;
  let fMinX = w;
  let fMaxX = -1;
  let fMinY = h;
  let fMaxY = -1;
  const y0 = Math.floor(bandTop * h);
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! < alphaCut) continue;
      const nx = (x + 0.5) / w;
      if (nx < nMinX || nx > nMaxX) continue;
      if (x < fMinX) fMinX = x;
      if (x > fMaxX) fMaxX = x;
      if (y < fMinY) fMinY = y;
      if (y > fMaxY) fMaxY = y;
    }
  }
  if (fMaxX < fMinX) {
    fMinX = minX;
    fMaxX = maxX;
    fMinY = Math.floor(bandTop * h);
    fMaxY = maxY;
  }

  // Horizontal bands across the wall body — skip roof tip; include lower wall /
  // foundation. Thin south apron is carved later in world space for walk-behind.
  const bands: PropOpaqueBand[] = [];
  const sliceTop = nMinY + (nMaxY - nMinY) * 0.22;
  const sliceBot = nMinY + (nMaxY - nMinY) * 0.9;
  const sliceH = Math.max(1 / h, sliceBot - sliceTop);
  for (let i = 0; i < BAND_COUNT; i++) {
    const t0 = sliceTop + (sliceH * i) / BAND_COUNT;
    const t1 = sliceTop + (sliceH * (i + 1)) / BAND_COUNT;
    const ry0 = Math.max(0, Math.floor(t0 * h));
    const ry1 = Math.min(h - 1, Math.ceil(t1 * h) - 1);
    let bMin = w;
    let bMax = -1;
    for (let y = ry0; y <= ry1; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3]! < alphaCut) continue;
        if (x < bMin) bMin = x;
        if (x > bMax) bMax = x;
      }
    }
    if (bMax < bMin) continue;
    const span = (bMax - bMin + 1) / w;
    // Ignore tiny tips (chimney / step) that would add useless needles.
    if (span < 0.12) continue;
    bands.push({
      minX: Math.max(0, bMin / w - padX),
      maxX: Math.min(1, (bMax + 1) / w + padX),
      y: (t0 + t1) * 0.5,
      h: Math.max(1 / h, t1 - t0),
    });
  }

  return {
    minX: nMinX,
    minY: nMinY,
    maxX: nMaxX,
    maxY: nMaxY,
    footMinX: Math.max(nMinX, fMinX / w - padX),
    footMaxX: Math.min(nMaxX, (fMaxX + 1) / w + padX),
    footMinY: Math.max(nMinY, fMinY / h - padY),
    footMaxY: Math.min(nMaxY, (fMaxY + 1) / h + padY),
    bands,
  };
}
