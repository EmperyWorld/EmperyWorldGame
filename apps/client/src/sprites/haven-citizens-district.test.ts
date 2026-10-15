import { describe, expect, it } from 'vitest';
import { resolveCitizenDistrictNpcId } from './haven-citizen-district.js';

type DistrictDef = Parameters<typeof resolveCitizenDistrictNpcId>[0];

function def(
  look: DistrictDef['look'],
  tiles: DistrictDef['tiles'],
  nightPatrolOnly = true,
): DistrictDef {
  return { look, tiles, nightPatrolOnly };
}

describe('resolveCitizenDistrictNpcId night pockets', () => {
  it('labels forum night-market sitters as the night row', () => {
    expect(resolveCitizenDistrictNpcId(def('merchant', [[38, 20]]))).toEqual({
      npcId: 'haven_citizen_plaza',
      label: 'Ночной ряд',
    });
    expect(resolveCitizenDistrictNpcId(def('human', [[42, 20]]))).toEqual({
      npcId: 'haven_citizen_plaza',
      label: 'Ночной ряд',
    });
  });

  it('keeps inn patrons as tavern regulars', () => {
    expect(resolveCitizenDistrictNpcId(def('human', [[56, 19]]))).toEqual({
      npcId: 'haven_citizen_tavern',
      label: 'Завсегдатай',
    });
  });

  it('maps cathedral vigil and healer porch to cathedral dialogue', () => {
    expect(resolveCitizenDistrictNpcId(def('mira', [[50, 11]]))).toEqual({
      npcId: 'haven_citizen_cathedral',
      label: 'Всенощная',
    });
    expect(resolveCitizenDistrictNpcId(def('human', [[45, 16]]))).toEqual({
      npcId: 'haven_citizen_cathedral',
      label: 'У Серы',
    });
  });

  it('maps harbor night sitters and captain patrols', () => {
    expect(resolveCitizenDistrictNpcId(def('human', [[63, 47]]))).toEqual({
      npcId: 'haven_citizen_harbor',
      label: 'Ночной причал',
    });
    expect(resolveCitizenDistrictNpcId(def('captain', [[40, 8]]))).toEqual({
      npcId: 'haven_citizen_guard',
      label: 'Ночной страж',
    });
  });

  it('labels HQ campus and garrison extras', () => {
    expect(resolveCitizenDistrictNpcId({ look: 'captain', tiles: [[59, 32]] })).toEqual({
      npcId: 'haven_citizen_guard',
      label: 'Периметр HQ',
    });
    expect(resolveCitizenDistrictNpcId({ look: 'captain', tiles: [[13, 11]] })).toEqual({
      npcId: 'haven_citizen_guard',
      label: 'Гарнизон',
    });
  });
});
