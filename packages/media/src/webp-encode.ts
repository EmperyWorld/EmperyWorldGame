import sharp from 'sharp';

/** Canonical on-disk / URL extension for generated game assets. */
export const ASSET_IMAGE_EXT = 'webp' as const;

// Preserve fine material texture from the upscaled master while keeping
// hundreds of runtime assets practical to stream.
const DEFAULT_QUALITY = 95;

/**
 * Encode a PNG (or other sharp-readable) buffer to WebP with alpha.
 * Used after ComfyUI + post-process so shipped assets are smaller on the wire.
 */
export async function encodeToWebp(
  input: Buffer,
  opts?: { quality?: number },
): Promise<Buffer> {
  return sharp(input)
    .webp({
      quality: opts?.quality ?? DEFAULT_QUALITY,
      alphaQuality: 100,
      effort: 6,
    })
    .toBuffer();
}

/** Decode any sharp-readable image to PNG bytes for pngjs post-process. */
export async function decodeToPng(input: Buffer): Promise<Buffer> {
  return sharp(input).png().toBuffer();
}
