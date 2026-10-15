/**
 * CSS % background-position aligns (pos% of image) with (pos% of element).
 * For a frame at (x,y) that should fill the wrap:
 *   size = atlas/frame * 100%,  pos = x / (atlas - frame) * 100%
 * (Negative px-style offsets like -x/frame are wrong under the % algorithm —
 * with shelf pad=2 every icon was shifted into empty space.)
 */
export function hudAtlasBackgroundStyle(
  frame: { x: number; y: number; w: number; h: number },
  atlasW: number,
  atlasH: number,
): { backgroundSize: string; backgroundPosition: string } {
  const w = Math.max(1, frame.w);
  const h = Math.max(1, frame.h);
  const denomX = Math.max(1, atlasW - w);
  const denomY = Math.max(1, atlasH - h);
  return {
    backgroundSize: `${(atlasW / w) * 100}% ${(atlasH / h) * 100}%`,
    backgroundPosition: `${(frame.x / denomX) * 100}% ${(frame.y / denomY) * 100}%`,
  };
}
