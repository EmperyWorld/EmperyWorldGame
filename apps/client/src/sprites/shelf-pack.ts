export interface PackRect {
  id: string;
  w: number;
  h: number;
}

export interface PackedRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShelfPackResult {
  placed: PackedRect[];
  skipped: string[];
  width: number;
  height: number;
}

/** Shelf packer matching world-media-atlas.ts (sort by height, wrap at maxSize). */
export function shelfPack(
  rects: readonly PackRect[],
  maxSize: number,
  pad = 2,
): ShelfPackResult {
  const entries = [...rects].sort((a, b) => b.h - a.h || b.w - a.w);
  let cursorX = pad;
  let cursorY = pad;
  let rowH = 0;
  let atlasW = 0;
  let atlasH = 0;
  const placed: PackedRect[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const cellW = entry.w + pad;
    const cellH = entry.h + pad;
    if (cursorX + cellW > maxSize && cursorX > pad) {
      cursorX = pad;
      cursorY += rowH + pad;
      rowH = 0;
    }
    if (cursorY + cellH > maxSize) {
      skipped.push(entry.id);
      continue;
    }
    placed.push({ id: entry.id, x: cursorX, y: cursorY, w: entry.w, h: entry.h });
    cursorX += cellW;
    rowH = Math.max(rowH, entry.h);
    atlasW = Math.max(atlasW, cursorX);
    atlasH = Math.max(atlasH, cursorY + entry.h + pad);
  }

  return {
    placed,
    skipped,
    width: Math.min(maxSize, Math.max(64, atlasW)),
    height: Math.min(maxSize, Math.max(64, atlasH)),
  };
}

/** Atlas frame ids are `prop-${assetId}`; leftover preload needs the asset id. */
export function leftoverAssetIds(skippedFrameIds: readonly string[]): string[] {
  return skippedFrameIds.map((id) => (id.startsWith('prop-') ? id.slice('prop-'.length) : id));
}

export function phaserHashAtlasJson(
  frames: PackedRect[],
  imageFile: string,
  width: number,
  height: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of frames) {
    out[f.id] = {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize: { w: f.w, h: f.h },
    };
  }
  return {
    frames: out,
    meta: {
      app: 'empery-pack-media-atlases',
      image: imageFile,
      size: { w: width, h: height },
      scale: '1',
    },
  };
}
