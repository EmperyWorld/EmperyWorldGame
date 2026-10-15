import { describe, expect, it } from 'vitest';
import { MAPS_STAMP, mapJsonUrl } from './maps-stamp.js';

describe('mapJsonUrl', () => {
  it('strips map- prefix and appends stamp', () => {
    expect(mapJsonUrl('map-empery_haven')).toBe(
      `/maps/empery_haven.json?v=${encodeURIComponent(MAPS_STAMP)}`,
    );
    expect(mapJsonUrl('starter_grove')).toContain('/maps/starter_grove.json?v=');
  });
});
