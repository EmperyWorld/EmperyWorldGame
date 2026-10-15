import { describe, expect, it } from 'vitest';
import { propLayerKind } from './prop-layer.js';

describe('propLayerKind', () => {
  it('classifies flat pads', () => {
    expect(propLayerKind('prop_fountain')).toBe('flat');
    expect(propLayerKind('prop_flower_bed')).toBe('flat');
    expect(propLayerKind('prop_open_stage')).toBe('flat');
    expect(propLayerKind('prop_pier')).toBe('flat');
    expect(propLayerKind('prop_pier_long')).toBe('flat');
    expect(propLayerKind('prop_ship_caravel')).toBe('flat');
    expect(propLayerKind('prop_ship_brig_e')).toBe('flat');
    expect(propLayerKind('prop_ship_skiff_nw')).toBe('flat');
  });

  it('classifies trees as trunk', () => {
    expect(propLayerKind('prop_tree_oak')).toBe('trunk');
    expect(propLayerKind('prop_orchard_tree')).toBe('trunk');
  });

  it('classifies arches as walk-through', () => {
    expect(propLayerKind('prop_rose_arch')).toBe('arch');
    expect(propLayerKind('prop_colonnade')).toBe('arch');
    expect(propLayerKind('prop_forum_arch')).toBe('arch');
  });

  it('classifies market stalls as open-front', () => {
    expect(propLayerKind('prop_market_stall')).toBe('stall');
    expect(propLayerKind('prop_spice_stall')).toBe('stall');
    expect(propLayerKind('prop_market_canopy')).toBe('stall');
    expect(propLayerKind('prop_shop_front')).toBe('stall');
    expect(propLayerKind('prop_merchant_cart')).toBe('stall');
    expect(propLayerKind('prop_flower_cart')).toBe('stall');
  });

  it('keeps heavy wagons behind', () => {
    expect(propLayerKind('prop_covered_wagon')).toBe('behind');
    expect(propLayerKind('prop_wagon')).toBe('behind');
    expect(propLayerKind('prop_carriage')).toBe('behind');
  });

  it('classifies landmarks as behind', () => {
    expect(propLayerKind('prop_clock_tower')).toBe('behind');
    expect(propLayerKind('prop_inn')).toBe('behind');
    expect(propLayerKind('prop_house_stone')).toBe('behind');
  });
});
