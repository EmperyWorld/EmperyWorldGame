import { describe, expect, it } from 'vitest';
import { isTilemapGpuLayer, preferGpuGround, type GroundLayer } from './ground-layer.js';

describe('isTilemapGpuLayer', () => {
  it('ducks on generateLayerDataTexture, not constructor.name', () => {
    const gpu = { generateLayerDataTexture: () => undefined } as unknown as GroundLayer;
    const cpu = { getTileAtWorldXY: () => null } as unknown as GroundLayer;
    expect(isTilemapGpuLayer(gpu)).toBe(true);
    expect(isTilemapGpuLayer(cpu)).toBe(false);
  });
});

describe('preferGpuGround', () => {
  it('keeps terrain on CPU to avoid black clear', () => {
    expect(preferGpuGround({ image: { source: [{ image: {} }] } } as never)).toBe(false);
    const FakeImage = class {
      complete = true;
      naturalWidth = 512;
      naturalHeight = 64;
    };
    const prev = globalThis.HTMLImageElement;
    (globalThis as { HTMLImageElement: unknown }).HTMLImageElement = FakeImage;
    try {
      expect(preferGpuGround({ image: { source: [{ image: new FakeImage() }] } } as never)).toBe(false);
    } finally {
      (globalThis as { HTMLImageElement: unknown }).HTMLImageElement = prev;
    }
  });
});
