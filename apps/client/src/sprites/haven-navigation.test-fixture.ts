import { HAVEN } from '../../../../scripts/layouts/empery_haven.mjs';
import { readFileSync } from 'node:fs';
import { propCollisionBoxes, worldProps } from '@empery/shared/world-props';
import { PROP_COLLIDER_GROUP_KEY } from './prop-colliders.js';
import { GROUND_LAYER_KEY } from './world-tiles.js';
import { isWalkableTileGid } from '../game/systems/world-geodata.js';
export function havenScene(gatesOpen=true): Phaser.Scene {
  const map = JSON.parse(readFileSync(new URL('../../public/maps/empery_haven.json', import.meta.url), 'utf8'));
  const ground = map.layers.find((layer: { name: string }) => layer.name === 'ground');
  const colliders = worldProps('empery_haven',{stations:HAVEN.stations}).flatMap(([id, x, y, size]) => propCollisionBoxes(id, x, y, size, gatesOpen))
    .map(box => ({ body: { left: box.cx - box.bw / 2, right: box.cx + box.bw / 2, top: box.cy - box.bh / 2, bottom: box.cy + box.bh / 2 } }));
  const values = new Map<string, unknown>([
    [PROP_COLLIDER_GROUP_KEY, { scene: {}, children: {}, getLength: () => colliders.length, getChildren: () => colliders }],
    [GROUND_LAYER_KEY, { tilemap:{tileWidth:map.tilewidth,tileHeight:map.tileheight}, getTileAt:(tx:number,ty:number)=>{if(tx<0||ty<0||tx>=map.width||ty>=map.height)return null;const index=ground.data[ty*map.width+tx];return {index,collides:!isWalkableTileGid(index)};}, getTileAtWorldXY: (x: number, y: number) => {
      const tx = Math.floor(x / map.tilewidth), ty = Math.floor(y / map.tileheight);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
      const index = ground.data[ty * map.width + tx];
      return { index, collides: !isWalkableTileGid(index) };
    } }],
  ]);
  return { data: values, physics: { world: { bounds: { x: 0, y: 0, right: map.width * map.tilewidth, bottom: map.height * map.tileheight } } } } as unknown as Phaser.Scene;
}
