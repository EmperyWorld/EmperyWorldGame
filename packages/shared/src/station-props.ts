import type { WorldProp } from './world-props.js';
export type StationKind = 'campfire' | 'hearth' | 'water' | 'pot';
export interface StationPlacement { kind: string; x: number; y: number }
export interface StationPropSpec { assetId: string; size: number }
const SPECS: Record<StationKind, StationPropSpec> = {
  water: { assetId: 'prop_well', size: 88 },
  campfire: { assetId: 'prop_campfire', size: 64 },
  hearth: { assetId: 'prop_hearth', size: 72 },
  pot: { assetId: 'prop_cookpot', size: 48 },
};
export function stationPropSpec(locationId: string, station: StationPlacement, stations: readonly StationPlacement[]): StationPropSpec | null {
  const spec = SPECS[station.kind as StationKind];
  if (!spec) return null;
  if (station.kind === 'pot' && stations.some(other => other.kind === 'hearth' && Math.hypot(other.x - station.x, other.y - station.y) <= 48)) return null;
  if (locationId === 'haven_apartment' && station.kind === 'hearth') return null;
  if (locationId === 'empery_haven' && station.kind === 'water') return null;
  if (locationId === 'haven_apartment' && station.kind === 'water') return { assetId: 'prop_washbasin', size: 56 };
  return spec;
}
export function worldStationProps(locationId: string, stations: readonly StationPlacement[]): WorldProp[] {
  return stations.flatMap(station => { const spec = stationPropSpec(locationId, station, stations); return spec ? [[spec.assetId, station.x, station.y, spec.size] as WorldProp] : []; });
}
