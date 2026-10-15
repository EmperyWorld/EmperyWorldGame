import {
  havenTravelPadAabb,
  HAVEN_TRAVEL_PAD_DEFAULT_RADIUS,
  HAVEN_TRAVEL_PAD_Y_OFFSET,
} from '@empery/shared';

export { HAVEN_TRAVEL_PAD_DEFAULT_RADIUS, HAVEN_TRAVEL_PAD_Y_OFFSET };

/** Player origin is inside the same AABB PortalSystem draws (rect at y+40). */
export function playerInsideTravelPad(
  px: number,
  py: number,
  zoneX: number,
  zoneY: number,
  radius = HAVEN_TRAVEL_PAD_DEFAULT_RADIUS,
): boolean {
  const box = havenTravelPadAabb(zoneX, zoneY, radius);
  return px >= box.L && px <= box.R && py >= box.T && py <= box.B;
}

export function travelConfirmLabel(zoneLabel: string): string {
  const name = zoneLabel.replace(/\s*\[[ER]\]\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  return `${name} [R]`;
}
