/** Bumped by `scripts/generate-maps.mjs` so Phaser/HTTP cache does not keep a stale Tiled JSON. */
export const MAPS_STAMP = 'a4a4bfbe9202';

export function mapJsonUrl(mapKey: string, stamp = MAPS_STAMP): string {
  const id = mapKey.replace(/^map-/, '');
  return `/maps/${id}.json?v=${encodeURIComponent(stamp)}`;
}
