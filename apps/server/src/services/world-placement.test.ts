import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { locationDisallowsMount } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { loadLocations, getLocation, arrivalSpawnForTravel } from './locations.js';
import { PlayerAuthority } from './player-authority.js';

const locations = loadLocations();
const authority = new PlayerAuthority(fileURLToPath(new URL('../../../client/public/maps', import.meta.url)));
describe('shipped world spawn and transition data', () => {
  it.each([true,false])('provides clear arrivals for every shipped travel edge with gatesOpen=%s', gatesOpen => {
    const geometry=new PlayerAuthority(fileURLToPath(new URL('../../../client/public/maps', import.meta.url)),()=>gatesOpen);
    const failures:string[]=[];
    for(const from of locations)for(const zone of from.zones??[]) {
      if(!zone.travelTo)continue;
      const dest=getLocation(zone.travelTo)!;
      const arrival=arrivalSpawnForTravel(from.id,dest);
      for(const mounted of [false,true])for(const tier of [1,2,3])for(const hqAccess of [false,true]) {
        if(mounted&&locationDisallowsMount(dest))continue;
        const world=geometry.collisionWorld({location:dest.id,questFlags:{quest_empery_hq_access:hqAccess},housing:{tier},mount:{mounted}} as PlayerSave);
        if(world.blocked(arrival.x,arrival.y))failures.push(`${from.id}->${dest.id}, mounted=${mounted}, tier=${tier}, hq=${hqAccess}`);
      }
    }
    expect(failures).toEqual([]);
  });
  it.each(locations.map(location => [location.id, location] as const))('%s has a clear authored player spawn and valid travel targets', (_id, location) => {
    const world = authority.collisionWorld({ location: location.id, questFlags: {} } as PlayerSave);
    expect(world.blocked(location.spawn.x, location.spawn.y), 'spawn must not depend on emergency relocation').toBe(false);
    for (const zone of location.zones ?? []) {
      expect(Number.isFinite(zone.x) && Number.isFinite(zone.y), zone.label).toBe(true);
      if (zone.travelTo) expect(getLocation(zone.travelTo), `${location.id} -> ${zone.travelTo}`).toBeDefined();
    }
    for (const point of [...location.npcs, ...(location.stations ?? [])]) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y), point.id).toBe(true);
      expect(point.x >= 0 && point.x < world.map.width * world.map.tilewidth, point.id).toBe(true);
      expect(point.y >= 0 && point.y < world.map.height * world.map.tileheight, point.id).toBe(true);
    }
  });
});
