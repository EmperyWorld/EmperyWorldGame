import { EMPERY_HQ_LOBBY_PROPS } from './empery-hq-lobby.js';
import { HAVEN_GARRISON_PROPS, HAVEN_GARRISON_FENCE } from './haven-garrison-layout.js';
import { HAVEN_CITY_PROPS } from './haven-city-data.js';
import { HAVEN_STAGE_LAYOUT } from './haven-stage-layout.js';
import { HAVEN_RESIDENTIAL_COURT_PROPS } from './haven-residential-layout.js';
import { HAVEN_SHIP_DISPLAY_SCALE, isHavenShipHullAsset } from './haven-harbor.js';
import { worldStationProps, type StationPlacement } from './station-props.js';
import { EMPERY_HQ_PROPS } from './empery-hq-data.js';
import { HAVEN_NPC_BUILDINGS, havenCityPropReplacedByNpcLandmark } from './haven-npc-buildings.js';
import { footprintForProp, isPropPassThrough, shouldForcePropAabb } from './prop-footprint.js';
import { propColliderMode } from './prop-layer.js';
import { silhouetteColliderBoxes, type PropOpaqueNorm } from './prop-silhouette-math.js';
import type { CollisionBox } from './world-collision.js';
import { PROP_OPAQUE_BOUNDS } from './prop-opaque-bounds.js';
export type WorldProp = readonly [string,number,number,number];
export const WORLD_STATIC_PROPS: Record<string, Array<[string,number,number,number,number]>> = {
  "suburban_park": [
    [
      "prop_fountain",
      2560,
      1520,
      150,
      6
    ],
    [
      "prop_bench",
      2320,
      1480,
      70,
      5
    ],
    [
      "prop_bench",
      2800,
      1480,
      70,
      5
    ],
    [
      "prop_bench",
      2320,
      1680,
      70,
      5
    ],
    [
      "prop_bench",
      2800,
      1680,
      70,
      5
    ],
    [
      "prop_planter",
      2200,
      1400,
      60,
      5
    ],
    [
      "prop_planter",
      2920,
      1400,
      60,
      5
    ],
    [
      "prop_planter",
      2200,
      1720,
      60,
      5
    ],
    [
      "prop_planter",
      2920,
      1720,
      60,
      5
    ],
    [
      "prop_signpost",
      480,
      1680,
      70,
      6
    ],
    [
      "prop_signpost",
      4640,
      1680,
      70,
      6
    ]
  ],
  "citadel_approach": [
    [
      "prop_shrine",
      2560,
      1792,
      120,
      7
    ],
    [
      "prop_guard_tower",
      1600,
      1120,
      130,
      7
    ],
    [
      "prop_guard_tower",
      3520,
      1120,
      130,
      7
    ],
    [
      "prop_guard_tower",
      1600,
      2480,
      130,
      7
    ],
    [
      "prop_guard_tower",
      3520,
      2480,
      130,
      7
    ],
    [
      "prop_banner_pole",
      2360,
      1560,
      80,
      6
    ],
    [
      "prop_banner_pole",
      2760,
      1560,
      80,
      6
    ],
    [
      "prop_banner_pole",
      2360,
      2040,
      80,
      6
    ],
    [
      "prop_banner_pole",
      2760,
      2040,
      80,
      6
    ],
    [
      "prop_rock_volcanic",
      1920,
      1280,
      90,
      5
    ],
    [
      "prop_rock_volcanic",
      3200,
      2304,
      90,
      5
    ],
    [
      "prop_crate_stack",
      1760,
      1760,
      80,
      5
    ],
    [
      "prop_crate_stack",
      3360,
      1760,
      80,
      5
    ],
    [
      "prop_barrels",
      2000,
      2080,
      70,
      5
    ],
    [
      "prop_barrels",
      3120,
      1520,
      70,
      5
    ],
    [
      "prop_signpost",
      480,
      1680,
      70,
      6
    ],
    [
      "prop_totem",
      2560,
      1280,
      90,
      6
    ],
    [
      "prop_totem",
      2560,
      2304,
      90,
      6
    ]
  ]
};
const EXTRA: Record<string, WorldProp[]> = {
  "suburban_park": [
    [
      "prop_bush_garden",
      720,
      720,
      72
    ],
    [
      "prop_bush_garden",
      1120,
      800,
      72
    ],
    [
      "prop_bush_garden",
      4000,
      720,
      72
    ],
    [
      "prop_bush_garden",
      4480,
      800,
      72
    ],
    [
      "prop_bush_garden",
      640,
      2400,
      72
    ],
    [
      "prop_bush_garden",
      960,
      2720,
      72
    ],
    [
      "prop_bush_garden",
      4160,
      2400,
      72
    ],
    [
      "prop_bush_garden",
      4560,
      2720,
      72
    ],
    [
      "prop_bush_garden",
      1920,
      640,
      72
    ],
    [
      "prop_bush_garden",
      3200,
      640,
      72
    ],
    [
      "prop_bush_garden",
      1920,
      3040,
      72
    ],
    [
      "prop_bush_garden",
      3200,
      3040,
      72
    ]
  ],
  "abandoned_yard": [
    [
      "prop_rock_volcanic",
      1600,
      1200,
      70
    ],
    [
      "prop_rock_volcanic",
      1920,
      1600,
      70
    ],
    [
      "prop_rock_volcanic",
      2560,
      1400,
      70
    ],
    [
      "prop_rock_volcanic",
      3040,
      2200,
      70
    ],
    [
      "prop_rock_volcanic",
      3520,
      2480,
      70
    ],
    [
      "prop_rock_volcanic",
      4160,
      2000,
      70
    ],
    [
      "prop_rock_volcanic",
      1280,
      2200,
      70
    ],
    [
      "prop_rock_volcanic",
      2240,
      2680,
      70
    ],
    [
      "prop_rock_volcanic",
      3680,
      2800,
      70
    ]
  ]
};

export function worldProps(locationId:string, opts:{hqAccess?:boolean;tier?:number;landmarks?:Array<{kind:string;x:number;y:number}>;stations?:readonly StationPlacement[]}={}): WorldProp[] {
  let rows:WorldProp[] = [...(WORLD_STATIC_PROPS[locationId]??[]).map(([id,x,y,size])=>[id,x,y,size] as WorldProp),...(EXTRA[locationId]??[])];
  if(locationId==='empery_haven') {
    rows=[...HAVEN_CITY_PROPS.filter(([id,x,y,size])=>id!=='prop_open_stage'&&!havenCityPropReplacedByNpcLandmark(id,x,y,size)).map(([id,x,y,size])=>[id==='prop_hq_gate_closed'&&opts.hqAccess?'prop_hq_gate_open':id,x,y,size] as WorldProp),
      ...HAVEN_NPC_BUILDINGS.map(b=>[b.prop,b.x,b.y,b.size] as WorldProp),['prop_tenement_block',1056,2720,400],['prop_open_stage',HAVEN_STAGE_LAYOUT.x,HAVEN_STAGE_LAYOUT.y,HAVEN_STAGE_LAYOUT.size]];
    const {x:stageX,y:stageY,size:stageSize}=HAVEN_STAGE_LAYOUT;
    rows.push(...HAVEN_RESIDENTIAL_COURT_PROPS);
    for(const [ox,oy,size] of [[-.42,.38,60],[.42,.38,60],[-.22,.48,58],[.22,.48,58],[-.08,.54,56],[.08,.54,56]]) rows.push(['prop_bench',stageX+stageSize*ox!,stageY+stageSize*oy!,size!]);
    for(const side of [-1,1]) {rows.push(['prop_planter',stageX+side*stageSize*.56,stageY+stageSize*.3,52]);rows.push(['prop_rose_arch',stageX+side*stageSize*.62,stageY+stageSize*.02,95]);}
    rows.push(...HAVEN_GARRISON_PROPS,...HAVEN_GARRISON_FENCE);
    rows.push(['prop_anvil',836,2100,68],['prop_coal_pile',750,2104,70],['prop_firewood',730,2088,62],['prop_workbench',574,2000,80],['prop_plank_stack',504,1992,78],['prop_flour_sacks',1282,2238,70]);
  }
  if(locationId==='empery_hq_lobby')rows=EMPERY_HQ_LOBBY_PROPS.map(([id,x,y,size])=>[id,x,y,size]);
  if(locationId==='empery_hq')rows=EMPERY_HQ_PROPS.map(([id,x,y,size])=>[id,x,y,size]);
  if(locationId==='starter_grove') rows=[...[[120,180],[180,320],[280,140],[1080,200],[1120,480],[1040,680],[200,680],[320,600]].map(([x,y])=>['prop_tree_oak',x!,y!,88] as WorldProp),['prop_hut',388,380,96]];
  if(locationId==='silverwood')rows=[[100,160],[160,280],[1120,180],[1160,400],[140,620],[1100,640]].map(([x,y])=>['prop_tree_silver',x!,y!,88]);
  if(locationId==='ash_highlands')rows=[[120,140],[180,240],[1080,160],[1120,320],[160,580],[1060,620]].map(([x,y])=>['prop_rock_volcanic',x!,y!,56]);
  for(const lm of opts.landmarks??[]) if(locationId==='silverwood'&&lm.kind==='shrine')rows.push(['prop_shrine',lm.x,lm.y,72]);else if(locationId==='ash_highlands'&&lm.kind==='totem')rows.push(['prop_totem',lm.x,lm.y,80]);
  if(locationId==='haven_apartment') {
    const tier=opts.tier??1;
    rows=[['prop_apt_table',640,620,88],['prop_bench',580,660,56],['prop_bench',700,660,56],['prop_russian_stove',640,360,150],['prop_storage_chest',360,680,92],['prop_weapon_rack',920,680,92],['prop_icebox',900,520,78],tier>=2?['prop_apt_bed',400,920,110]:['prop_apt_bed',480,500,96]];
    if(tier>=3)rows.push(['prop_apt_table',820,900,80],['prop_weapon_rack',920,900,70]);
  }
  rows.push(...worldStationProps(locationId, opts.stations ?? []));
  return locationId === 'empery_haven'
    ? rows.map(([id,x,y,size]) => [id,x,y,isHavenShipHullAsset(id) ? Math.round(size*HAVEN_SHIP_DISPLAY_SCALE) : size] as WorldProp)
    : rows;
}
export function propCollisionBoxes(assetId:string,x:number,y:number,size:number,gatesOpen=false): readonly CollisionBox[] {
  if(assetId==='prop_garrison_fence_h')return [{cx:x,cy:y,bw:size,bh:16}];
  if(assetId==='prop_garrison_fence_v')return [{cx:x,cy:y,bw:16,bh:size}];
  if(assetId==='prop_open_stage') return [
    {cx:x,cy:y-size*.32,bw:size*.7,bh:size*.10},
    {cx:x-size*.38,cy:y-size*.12,bw:size*.06,bh:size*.34},
    {cx:x+size*.38,cy:y-size*.12,bw:size*.06,bh:size*.34},
  ];
  if(isPropPassThrough(assetId))return [];
  if(assetId==='prop_city_gate'||assetId==='prop_city_gate_s'||assetId==='prop_city_gate_e'||assetId==='prop_harbor_guard_arch'||assetId==='prop_city_gate_open'||assetId==='prop_city_gate_s_open'||assetId==='prop_city_gate_e_open'){
    const open=gatesOpen||assetId.includes('_open')||assetId==='prop_harbor_guard_arch';
    const opening=Math.max(open?72:20,Math.round(size*(open?.34:.08))),half=opening/2;
    const thick=Math.max(48,Math.round(size*(open?.32:.42))),deep=Math.max(36,Math.round(size*.42));
    const east=assetId==='prop_city_gate_e'||assetId==='prop_city_gate_e_open';
    const boxes:CollisionBox[]=east?[{cx:x,cy:y-half-thick/2,bw:deep,bh:thick},{cx:x,cy:y+half+thick/2,bw:deep,bh:thick}]:[{cx:x-half-thick/2,cy:y-size*.06,bw:thick,bh:deep},{cx:x+half+thick/2,cy:y-size*.06,bw:thick,bh:deep}];
    if(!open)boxes.push(east?{cx:x,cy:y,bw:Math.round(deep*.85),bh:Math.max(28,opening+8)}:{cx:x,cy:y-size*.06,bw:Math.max(28,opening+12),bh:Math.round(deep*.9)});
    return boxes;
  }
  const fp=footprintForProp(assetId,size);if(!fp)return [];
  const mode=propColliderMode(assetId),opaque=PROP_OPAQUE_BOUNDS[assetId] as PropOpaqueNorm|undefined;
  const lowFurniture=assetId==='prop_hq_reception_desk'||assetId==='prop_hq_lounge_sofa';
  if(opaque&&!shouldForcePropAabb(assetId))return silhouetteColliderBoxes(x,y,size,opaque,mode).map(box=>lowFurniture?{...box,blocksSight:false}:box);
  const bw=Math.max(mode==='arch'?12:14,Math.round(size*fp.w)),bh=Math.max(12,Math.round(size*fp.h)),cy=y+size*fp.oy;
  return mode==='arch'?[{cx:x-size*.28,cy,bw,bh},{cx:x+size*.28,cy,bw,bh}]:[{cx:x,cy,bw,bh,...(lowFurniture?{blocksSight:false}:{})}];
}
