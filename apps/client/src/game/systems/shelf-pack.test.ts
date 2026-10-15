import { describe, expect, it } from 'vitest';
import { leftoverAssetIds, phaserHashAtlasJson, shelfPack } from '../../sprites/shelf-pack.js';

describe('shelfPack', () => {
  it('places two tiles without overlap', () => {
    const r = shelfPack(
      [
        { id: 'a', w: 64, h: 64 },
        { id: 'b', w: 64, h: 32 },
      ],
      256,
      2,
    );
    expect(r.skipped).toEqual([]);
    expect(r.placed).toHaveLength(2);
    const [a, b] = r.placed;
    expect(a?.x).toBe(2);
    expect(b?.x).toBeGreaterThan(a!.x);
  });

  it('skips when the canvas is too small', () => {
    const r = shelfPack([{ id: 'huge', w: 200, h: 200 }], 64);
    expect(r.skipped).toEqual(['huge']);
    expect(r.placed).toEqual([]);
  });
});

describe('phaserHashAtlasJson', () => {
  it('emits TexturePacker hash frames', () => {
    const json = phaserHashAtlasJson(
      [{ id: 'prop-tree', x: 2, y: 2, w: 64, h: 64 }],
      'world.webp',
      128,
      128,
    ) as { frames: Record<string, { frame: { w: number } }>; meta: { image: string } };
    expect(json.meta.image).toBe('world.webp');
    expect(json.frames['prop-tree']?.frame.w).toBe(64);
  });
});

describe('leftoverAssetIds', () => {
  it('strips the prop- texture prefix', () => {
    expect(leftoverAssetIds(['prop-prop_tree_oak', 'item_sword'])).toEqual([
      'prop_tree_oak',
      'item_sword',
    ]);
  });
});
