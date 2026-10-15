import { describe, expect, it } from 'vitest';
import { HAVEN_CITY_PROPS } from '../../sprites/haven-city-data.js';
import {
  cityMapKioskPromptAllowed,
  collectCityMapKiosks,
} from './city-map-kiosks.js';

const CENTRAL_BOARD = { id: 'town_notice_board', x: 2336, y: 1120 };

describe('collectCityMapKiosks', () => {
  it('turns distributed Haven signs and boards into unique map access points', () => {
    const kiosks = collectCityMapKiosks(
      'empery_haven',
      HAVEN_CITY_PROPS,
      [CENTRAL_BOARD],
    );
    const coordinates = new Set(kiosks.map((point) => `${point.x},${point.y}`));

    expect(kiosks.length).toBeGreaterThanOrEqual(8);
    expect(coordinates.size).toBe(kiosks.length);
    expect(kiosks.some((point) => point.label === 'Картограф [E]')).toBe(true);
    expect(kiosks.some((point) => point.label === 'Указатель [E]')).toBe(true);
  });

  it('omits the duplicate prompt at the central notice-board NPC', () => {
    const kiosks = collectCityMapKiosks(
      'empery_haven',
      HAVEN_CITY_PROPS,
      [CENTRAL_BOARD],
    );
    expect(
      kiosks.some(
        (point) =>
          Math.hypot(point.x - CENTRAL_BOARD.x, point.y - CENTRAL_BOARD.y) <= 96,
      ),
    ).toBe(false);
  });

  it('does not leak Haven kiosks into other locations', () => {
    expect(
      collectCityMapKiosks('empery_hq', HAVEN_CITY_PROPS, [CENTRAL_BOARD]),
    ).toEqual([]);
  });

  it('keeps NPC and survival-station prompts above map kiosks', () => {
    expect(cityMapKioskPromptAllowed(0, 0)).toBe(true);
    expect(cityMapKioskPromptAllowed(1, 0)).toBe(false);
    expect(cityMapKioskPromptAllowed(0, 1)).toBe(false);
  });
});
