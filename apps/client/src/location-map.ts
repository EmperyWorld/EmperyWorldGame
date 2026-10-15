import type { LocationDefinition } from './api.js';
import type { LocationConfig as GameLocationConfig } from './game/scenes/location-types.js';

export function toGameLocation(
  loc: LocationDefinition,
  assetUrl: (assetId: string) => string | undefined,
): GameLocationConfig {
  return {
    id: loc.id,
    name: loc.name,
    subtitle: loc.subtitle,
    mapKey: loc.mapKey,
    backgroundAsset: loc.backgroundAsset,
    backgroundUrl: assetUrl(loc.backgroundAsset),
    safeZone: loc.safeZone,
    anomalyTier: loc.anomalyTier,
    dayNight: loc.dayNight,
    tierLabel: loc.tierLabel,
    recommendedLevel: loc.recommendedLevel,
    spawn: loc.spawn,
    npcs: loc.npcs ?? [],
    stations: loc.stations,
    seagulls: loc.seagulls,
    zones: loc.zones,
    landmarks: loc.landmarks,
    enemies: loc.enemies,
    farmSpawn: loc.farmSpawn,
    questSpawns: loc.questSpawns,
    questComplete: loc.questComplete,
  };
}
