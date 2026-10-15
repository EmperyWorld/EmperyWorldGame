import { describe, expect, it } from 'vitest';
import { HAVEN_NPC_BUILDINGS } from './haven-npc-buildings.js';
import { locationPropIds } from './location-prop-ids.js';

describe('locationPropIds', () => {
  it('loads a small grove set instead of the full city kit', () => {
    const grove = locationPropIds('starter_grove');
    const haven = locationPropIds('empery_haven');
    expect(grove.has('prop_hut')).toBe(true);
    expect(grove.has('prop_governor_palace')).toBe(false);
    expect(haven.has('prop_governor_palace')).toBe(true);
    expect(grove.size).toBeLessThan(20);
    expect(haven.size).toBeGreaterThan(80);
  });

  it('scopes HQ and apartment props', () => {
    const hq = locationPropIds('empery_hq');
    const apt = locationPropIds('haven_apartment');
    expect(hq.has('prop_hq_building')).toBe(true);
    expect(apt.has('prop_apt_bed')).toBe(true);
    expect(apt.has('prop_hq_building')).toBe(false);
  });

  it('always includes survival station art', () => {
    const fields = locationPropIds('adena_fields');
    expect(fields.has('prop_campfire')).toBe(true);
    expect(fields.has('prop_well')).toBe(true);
  });

  it('preloads every Haven NPC landmark so colossi are not brown fallbacks', () => {
    const haven = locationPropIds('empery_haven');
    expect(haven.has('prop_house_cottage')).toBe(true);
    const missing = HAVEN_NPC_BUILDINGS.map((b) => b.prop).filter((id) => !haven.has(id));
    expect(missing).toEqual([]);
  });

  it('includes runtime haven craft and training props', () => {
    const haven = locationPropIds('empery_haven');
    expect(haven.has('prop_training_dummy')).toBe(true);
    expect(haven.has('prop_coal_pile')).toBe(true);
    expect(haven.has('prop_flour_sacks')).toBe(true);
    expect(haven.has('tile_haven_dock_a')).toBe(true);
    expect(haven.has('tile_haven_dock_b')).toBe(true);
    expect(haven.has('tile_haven_dock_c')).toBe(true);
    expect(haven.has('tile_haven_dock_d')).toBe(true);
    expect(haven.has('tile_haven_dock_e')).toBe(true);
  });

  it('preloads sailing-ship heading variants for patrol frame swaps', () => {
    const haven = locationPropIds('empery_haven');
    expect(haven.has('prop_ship_brig_e')).toBe(true);
    expect(haven.has('prop_ship_brig_nw')).toBe(true);
    expect(haven.has('prop_ship_caravel_s')).toBe(true);
    expect(haven.has('prop_ship_skiff_w')).toBe(true);
  });
});
