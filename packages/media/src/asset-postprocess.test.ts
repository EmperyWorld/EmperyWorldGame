import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import {
  healInteriorAlphaHoles,
  normalizePropSprite,
  normalizeShipSprite,
  removeBorderConnectedBackground,
} from './asset-postprocess.js';

function solidSquare(): PNG {
  const png = new PNG({ width: 32, height: 32 });
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const edge = x === 0 || y === 0 || x === 31 || y === 31;
      const i = (y * 32 + x) << 2;
      if (edge) {
        png.data[i] = 0;
        png.data[i + 1] = 0;
        png.data[i + 2] = 0;
        png.data[i + 3] = 255;
      } else {
        // dark stone interior — above cut threshold, must stay opaque
        png.data[i] = 40;
        png.data[i + 1] = 36;
        png.data[i + 2] = 32;
        png.data[i + 3] = 255;
      }
    }
  }
  return png;
}

describe('prop alpha postprocess', () => {
  it('keeps dark interior pixels when cutting border backdrop', () => {
    const cut = removeBorderConnectedBackground(solidSquare(), 22);
    const center = (16 * 32 + 16) << 2;
    expect(cut.data[center + 3]).toBe(255);
    expect(cut.data[3]).toBe(0);
  });

  it('heals interior transparent holes left by old luminance cuts', () => {
    const png = solidSquare();
    for (let y = 12; y < 20; y++) {
      for (let x = 12; x < 20; x++) {
        const i = (y * 32 + x) << 2;
        png.data[i + 3] = 0;
      }
    }
    const healed = healInteriorAlphaHoles(png);
    const center = (16 * 32 + 16) << 2;
    expect(healed.data[center + 3]).toBe(255);
  });

  it('normalizes props to 512 and preserves dark masonry', () => {
    const src = new PNG({ width: 64, height: 64 });
    for (let i = 0; i < src.data.length; i += 4) {
      src.data[i] = 48;
      src.data[i + 1] = 44;
      src.data[i + 2] = 40;
      src.data[i + 3] = 255;
    }
    // black border frame
    for (let x = 0; x < 64; x++) {
      for (const y of [0, 63]) {
        const i = (y * 64 + x) << 2;
        src.data[i] = 0;
        src.data[i + 1] = 0;
        src.data[i + 2] = 0;
      }
    }
    const out = normalizePropSprite(src);
    expect(out.width).toBe(512);
    expect(out.height).toBe(512);
    const mid = ((256 * 512 + 256) << 2) + 3;
    expect(out.data[mid]).toBe(255);
  });

  it('keeps near-black ship hulls that touch the frame', () => {
    const src = new PNG({ width: 64, height: 64 });
    for (let i = 0; i < src.data.length; i += 4) {
      src.data[i] = 0;
      src.data[i + 1] = 0;
      src.data[i + 2] = 0;
      src.data[i + 3] = 255;
    }
    for (let y = 20; y < 64; y++) {
      for (let x = 20; x < 44; x++) {
        const i = (y * 64 + x) << 2;
        src.data[i] = 28;
        src.data[i + 1] = 18;
        src.data[i + 2] = 12;
      }
    }
    const out = normalizeShipSprite(src);
    expect(out.data[3]).toBe(0);
    const keel = ((400 * 512 + 256) << 2) + 3;
    expect(out.data[keel]).toBe(255);
  });

  it('cuts an isolated studio plate after a transparent inset', () => {
    const src = new PNG({ width: 64, height: 64 });
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) << 2;
        const inset = x < 8 || y < 8 || x >= 56 || y >= 56;
        if (inset) {
          src.data[i + 3] = 0;
          continue;
        }
        const hull = x >= 24 && x < 40 && y >= 24 && y < 48;
        src.data[i] = hull ? 28 : 0;
        src.data[i + 1] = hull ? 18 : 0;
        src.data[i + 2] = hull ? 12 : 0;
        src.data[i + 3] = 255;
      }
    }
    const out = normalizeShipSprite(src);
    expect(out.data[3]).toBe(0);
    const plate = ((80 * 512 + 80) << 2) + 3;
    expect(out.data[plate]).toBe(0);
    const hull = ((288 * 512 + 256) << 2) + 3;
    expect(out.data[hull]).toBe(255);
  });
});
