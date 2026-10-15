import { EMPERY_FOUNDERS } from './empery-founders.js';
/** Interior coordinates; the outdoor campus is a separate location. */
export const EMPERY_HQ_LOBBY = {
  width: 20, height: 14, tileSize: 64,
  floor: { x: 64, y: 64, width: 1152, height: 768 },
  spawn: { x: 640, y: 672 },
  exit: { x: 640, y: 800 },
  reception: { x: 640, y: 352 },
  backdrop: { x: 640, y: 192, size: 192 },
  sofas: [{ x: 384, y: 624 }, { x: 896, y: 624 }],
  planters: [
    {x: 160, y: 256}, {x: 1120, y: 256},
    {x: 160, y: 704}, {x: 1120, y: 704},
    {x: 496, y: 368}, {x: 784, y: 368},
  ],
} as const;

export const EMPERY_HQ_LOBBY_PROPS: ReadonlyArray<readonly [string,number,number,number]> = [
  ['prop_hq_reception_backdrop',EMPERY_HQ_LOBBY.backdrop.x,EMPERY_HQ_LOBBY.backdrop.y,EMPERY_HQ_LOBBY.backdrop.size],
  ['prop_hq_reception_desk',EMPERY_HQ_LOBBY.reception.x,EMPERY_HQ_LOBBY.reception.y+40,96],
  ...EMPERY_HQ_LOBBY.sofas.map(p=>['prop_hq_lounge_sofa',p.x,p.y,112] as const),
  ...EMPERY_HQ_LOBBY.planters.map(p=>['prop_hq_indoor_planter',p.x,p.y,48] as const),
];

export const EMPERY_HQ_LOBBY_NPCS = [
  {id:'town_hq_receptionist',...EMPERY_HQ_LOBBY.reception,label:'Ресепшен [E]'},
  ...EMPERY_FOUNDERS.map(f=>({id:f.id,...f.post,label:`${f.name} · автор [E]`})),
];
