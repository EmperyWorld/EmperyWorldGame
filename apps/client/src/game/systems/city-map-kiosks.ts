export interface CityMapKiosk {
  id: string;
  x: number;
  y: number;
  label: string;
}

type PropPlacement = readonly [
  id: string,
  x: number,
  y: number,
  size?: number,
  depth?: number,
];

const CITY_MAP_PROP_IDS = new Set([
  'prop_map_shop',
  'prop_notice_board',
  'prop_signpost',
  'prop_town_milestone',
]);

function kioskLabel(propId: string): string {
  if (propId === 'prop_map_shop') return 'Картограф [E]';
  if (propId === 'prop_notice_board') return 'Районная доска [E]';
  return 'Указатель [E]';
}

export function cityMapKioskPromptAllowed(
  nearbyNpcCount: number,
  nearbyStationCount: number,
): boolean {
  return nearbyNpcCount <= 0 && nearbyStationCount <= 0;
}

/**
 * Turns existing Haven infrastructure props into map access points. A kiosk
 * next to the real notice-board NPC is omitted to avoid overlapping prompts.
 */
export function collectCityMapKiosks(
  locationId: string,
  props: ReadonlyArray<PropPlacement>,
  npcs: ReadonlyArray<{ id: string; x: number; y: number }>,
  centralBoardExclusionRadius = 96,
): CityMapKiosk[] {
  if (locationId !== 'empery_haven') return [];
  const centralBoard = npcs.find((npc) => npc.id === 'town_notice_board');
  const exclusionSq = centralBoardExclusionRadius * centralBoardExclusionRadius;
  const seen = new Set<string>();
  const kiosks: CityMapKiosk[] = [];

  for (const [propId, x, y] of props) {
    if (!CITY_MAP_PROP_IDS.has(propId)) continue;
    if (centralBoard) {
      const dx = x - centralBoard.x;
      const dy = y - centralBoard.y;
      if (dx * dx + dy * dy <= exclusionSq) continue;
    }
    const coordinateKey = `${x},${y}`;
    if (seen.has(coordinateKey)) continue;
    seen.add(coordinateKey);
    kiosks.push({
      id: `city-map:${propId}:${coordinateKey}`,
      x,
      y,
      label: kioskLabel(propId),
    });
  }

  return kiosks;
}
