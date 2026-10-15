/** Shared physical layout: the barracks entrance and service posts stay unobstructed. */
export const HAVEN_GARRISON_LAYOUT = {
  origin: {x:928,y:672},
  entrance: {x:928,y:592},
  hearth: {x:864,y:864},
  sitters: [{x:828,y:904},{x:940,y:872},{x:856,y:936}],
  fencing: [{x:1028,y:864},{x:1084,y:864}],
  archer: {x:1168,y:696},
  archeryTargets: [{x:1248,y:640},{x:1248,y:704}],
  patrol: [{x:832,y:600},{x:1168,y:600},{x:1184,y:800},{x:1120,y:960},{x:800,y:992},{x:704,y:848},{x:752,y:600}],
} as const;
export const HAVEN_GARRISON_PROPS: ReadonlyArray<readonly [string,number,number,number]> = [
  ['prop_campfire',864,864,90], ['prop_cookpot',882,870,72], ['prop_firewood',800,820,64],
  ['prop_training_dummy',1104,640,70], ['prop_training_dummy',1104,696,68],
  ['prop_weapon_rack',744,704,72], ['prop_shield_stack',744,752,70],
  ['prop_soldier_tent',688,640,100], ['prop_soldier_tent',688,752,95],
  ['prop_archery_target',1248,640,78], ['prop_archery_target',1248,704,74],
];

/** Palisade with three public approaches; gates stay wide enough for mounted traffic. */
export const HAVEN_GARRISON_BOUNDARY = {left:256,right:1536,top:224,bottom:1088,gateWidth:192} as const;
export const HAVEN_GARRISON_GATES = [
  {x:928,y:1088}, {x:1536,y:736}, {x:256,y:736}, {x:1152,y:224},
] as const;
export const HAVEN_GARRISON_FENCE: ReadonlyArray<readonly [string,number,number,number]> = [
  ['prop_garrison_fence_h',656,224,800], ['prop_garrison_fence_h',1392,224,288],
  ['prop_garrison_fence_h',544,1088,576], ['prop_garrison_fence_h',1280,1088,512],
  ['prop_garrison_fence_v',256,432,416], ['prop_garrison_fence_v',256,960,256],
  ['prop_garrison_fence_v',1536,432,416], ['prop_garrison_fence_v',1536,960,256],
];
export interface GarrisonSoldier {
  role: 'drill'|'rest'|'patrol'|'gate';
  shift: 'day'|'night';
  post: {x:number;y:number};
}
const gatePosts=[{x:868,y:1040},{x:988,y:1040},{x:1488,y:688},{x:1488,y:784},{x:304,y:688},{x:304,y:784}];
export const HAVEN_GARRISON_SOLDIERS: readonly GarrisonSoldier[] = [
  ...[928,992].flatMap(y=>[1056,1120,1184,1248].map(x=>({role:'drill' as const,shift:'day' as const,post:{x,y}}))),
  ...[896,928].flatMap(y=>[568,632].map(x=>({role:'rest' as const,shift:'day' as const,post:{x,y}}))),
  ...['day','night'].flatMap(shift=>gatePosts.map(post=>({role:'gate' as const,shift:shift as 'day'|'night',post}))),
  ...['day','night'].flatMap(shift=>[768,896,1056,1312].map(x=>({role:'patrol' as const,shift:shift as 'day'|'night',post:{x,y:600}}))),
];
