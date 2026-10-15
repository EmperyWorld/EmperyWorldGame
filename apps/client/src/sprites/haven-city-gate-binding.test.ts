import { describe,expect,it,vi,beforeEach } from 'vitest';
const state=vi.hoisted(()=>({rest:false,texture:true,listener:null as (()=>void)|null}));
vi.mock('../world-clock.js',()=>({getHavenSchedule:()=>({restActive:state.rest}),subscribeHavenSchedule:(listener:()=>void)=>{state.listener=listener;return ()=>{state.listener=null;};}}));
vi.mock('./prop-colliders.js',()=>({cityGateClosedAssetId:(id:string)=>id,cityGateOpenAssetId:(id:string)=>`${id}_open`,isCityGateAsset:()=>true,refreshCityGateFootprint:vi.fn()}));
vi.mock('./place-world-prop.js',()=>({resolvePropDepth:()=>1}));
vi.mock('./texture-loader.js',()=>({hasPropTexture:()=>state.texture,propTextureKey:(id:string)=>id,WORLD_MEDIA_ATLAS_KEY:'atlas'}));
import { bindHavenCityGates,registerHavenCityGate } from './haven-city-gates.js';
import { refreshCityGateFootprint } from './prop-colliders.js';
beforeEach(()=>{state.rest=false;state.texture=true;state.listener=null;vi.clearAllMocks();});
function fixture(){
 const values=new Map<string,unknown>();const image={active:true,frame:{name:'initial'},setTexture:vi.fn(),setDepth:vi.fn()};
 const scene={data:values,textures:{exists:()=>true,get:()=>({has:()=>true})}} as unknown as Phaser.Scene;
 registerHavenCityGate(scene,'prop_city_gate',image as unknown as Phaser.GameObjects.Image,100,100,240);return scene;
}
describe('city gate schedule binding',()=>{
 it('rebuilds footprints only when day/night state changes',()=>{
  const scene=fixture(),unsubscribe=bindHavenCityGates(scene);for(let i=0;i<100;i++)state.listener?.();expect(refreshCityGateFootprint).toHaveBeenCalledTimes(1);
  state.rest=true;state.listener?.();expect(refreshCityGateFootprint).toHaveBeenCalledTimes(2);expect(refreshCityGateFootprint).toHaveBeenLastCalledWith(scene,'prop_city_gate',100,100,240);unsubscribe();expect(state.listener).toBeNull();
 });
 it('keeps the logical gate open when an optional open texture is missing',()=>{
  state.texture=false;const scene=fixture();bindHavenCityGates(scene);expect(refreshCityGateFootprint).toHaveBeenCalledWith(scene,'prop_city_gate_open',100,100,240);
 });
});
