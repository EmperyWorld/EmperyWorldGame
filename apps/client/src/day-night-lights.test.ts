import {describe,expect,it,vi} from 'vitest';
vi.mock('./sprites/night-glow-texture.js',()=>({ensureNightGlowTexture:()=> 'test-glow'}));
vi.mock('phaser',()=>({default:{BlendModes:{ADD:1}}}));
vi.mock('./game/systems/graphics-quality.js',()=>({getGraphicsProfile:()=>({nightLights:true,movingLights:false})}));
import {collectNightLightPoints,DayNightLights} from './day-night-lights.js';
import {HAVEN_NPC_POSTS,HAVEN_TRAVEL_PAD_Y_OFFSET} from '@empery/shared';
import {HAVEN_NIGHT_VENUES} from './sprites/haven-night-venues.js';
import type {LocationConfig} from './game/scenes/location-types.js';
describe('night city lighting placement',()=>{
 it('lights night service entrances at their canonical NPC posts',()=>{
  const points=collectNightLightPoints({id:'empery_haven'} as LocationConfig);
  for(const id of ['town_innkeeper','town_priest','town_healer','town_informant']){
   const post=HAVEN_NPC_POSTS.find(p=>p.id===id)!;
   expect(points.some(p=>p.x===post.postX&&p.y===post.postY&&p.r>=48)).toBe(true);
  }
  expect(HAVEN_NIGHT_VENUES.tavern).toEqual({x:3744,y:1376});
  expect(HAVEN_NIGHT_VENUES.informant).toEqual({x:3872,y:1824});
 });
 it('places entrance light on the actual travel pad without modifying its zone',()=>{
  const zone={x:1056,y:2912,travelTo:'haven_apartment'};
  const points=collectNightLightPoints({id:'empery_haven',zones:[zone]} as LocationConfig);
  expect(points.some(p=>p.x===zone.x&&p.y===zone.y+HAVEN_TRAVEL_PAD_Y_OFFSET&&p.r===32)).toBe(true);expect(zone.y).toBe(2912);
 });
 it('deduplicates collocated sources and ignores invalid geometry',()=>{
  const points=collectNightLightPoints({id:'test',stations:[{kind:'campfire',x:100,y:200,radius:40},{kind:'hearth',x:100,y:200,radius:80},{kind:'hearth',x:NaN,y:200,radius:30},{kind:'campfire',x:300,y:200,radius:-1}]} as LocationConfig);
  expect(points).toEqual([{x:100,y:200,r:80}]);
 });
 it('does not add city venue lights to private interiors',()=>{
  expect(collectNightLightPoints({id:'haven_apartment'} as LocationConfig)).toEqual([]);
 });
 it('keeps visible lamp halos with Light2D and hides them again at dawn',()=>{
  const graphics:Array<Record<string,ReturnType<typeof vi.fn>>>=[];
  const lights={enable:vi.fn(),setAmbientColor:vi.fn(),addLight:vi.fn(()=>({radius:0,intensity:0})),removeLight:vi.fn()};
  lights.enable.mockReturnValue(lights);lights.setAmbientColor.mockReturnValue(lights);
  const makeGraphic=()=>{
   const g:Record<string,ReturnType<typeof vi.fn>>={};for(const name of ['setDepth','setBlendMode','clear','fillStyle','fillCircle','setVisible','setAlpha','destroy','removeAll','add','setDisplaySize','setTint','setPosition'])g[name]=vi.fn(()=>g);graphics.push(g);return g;
  };
  const images:Array<Record<string,ReturnType<typeof vi.fn>>>=[];
  const scene={data:{get:()=>true},lights,add:{container:makeGraphic,graphics:makeGraphic,image:()=>{const image=makeGraphic();graphics.pop();images.push(image);return image;}}};
  const system=new DayNightLights();system.bind(scene as never,{id:'empery_haven'} as LocationConfig);
  expect(graphics).toHaveLength(2);system.update({darkness:0.8} as never,16);
  expect(graphics[0]!.setVisible).toHaveBeenLastCalledWith(true);expect(graphics[0]!.setAlpha.mock.calls.at(-1)![0]).toBeGreaterThan(0);
  const initialImages=images.length;
  const lanterns=Array.from({length:7},(_,i)=>({x:100+i*20,y:200}));
  system.update({darkness:0.8} as never,16,lanterns);
  expect(images.length-initialImages).toBe(8); // Four pooled halo/flame pairs on balanced settings.
  expect(images[initialImages]!.setPosition).toHaveBeenCalledWith(100,194);
  system.update({darkness:0.8} as never,16,[{x:150,y:200}]);
  expect(images.length-initialImages).toBe(8);
  expect(images[initialImages]!.setPosition).toHaveBeenLastCalledWith(150,194);
  expect(images[initialImages+2]!.setVisible).toHaveBeenLastCalledWith(false);
  system.update({darkness:0} as never,16);expect(graphics[0]!.setVisible).toHaveBeenLastCalledWith(false);
  system.shutdown();expect(graphics[0]!.destroy).toHaveBeenCalled();expect(lights.removeLight).toHaveBeenCalled();
 });

});
