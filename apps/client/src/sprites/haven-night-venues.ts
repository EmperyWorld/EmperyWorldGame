import { HAVEN_NPC_POSTS } from '@empery/shared';

function post(id: string): { x: number; y: number } {
  const point = HAVEN_NPC_POSTS.find(p => p.id === id);
  if (!point) throw new Error(`Missing Haven night venue: ${id}`);
  return { x: point.postX, y: point.postY };
}

/** Night effects follow the same entrances used by service actors and navigation. */
export const HAVEN_NIGHT_VENUES = {
  tavern: post('town_innkeeper'),
  cathedral: post('town_priest'),
  healer: post('town_healer'),
  informant: post('town_informant'),
} as const;
