import { ALL_CITIZEN_DEFS } from './haven-residents.js';
export interface CitizenAppearance {
  id: string;
  race: 'human'|'elf'|'orc';
  gender: 'male'|'female';
  age: number;
  skin: number; hair: number; body: number; trim: number; eye: number;
  hairStyle: number; faceShape: number; build: number; outfit: number; accessory: number;
  seed: number;
}
export function citizenSeed(id: string): number {
  let seed=2166136261;for(const char of id){seed=Math.imul(seed^char.charCodeAt(0),16777619);}return seed>>>0;
}
const SKIN=[0xf1c6a4,0xdca781,0xbc8058,0x8c5d43,0xe8ba91,0xa76f50];
const HAIR=[0x221b18,0x553824,0x946039,0xc0a26d,0xd5c5a4,0x8f2923,0x675552,0xaaa6a0];
const CLOTHES=[0x4c6587,0x73644b,0x84604d,0x3e6c58,0x7c4b5c,0x536570,0x936945,0x6c6283,0x44564b,0x794d39,0x9a8868,0x426972];
export function citizenAppearance(id: string, opts: {race?:CitizenAppearance['race'];gender?:CitizenAppearance['gender'];child?:boolean;soldier?:boolean}={}): CitizenAppearance {
  const seed=citizenSeed(id),race=opts.race??'human',gender=opts.gender??(seed&1?'female':'male');
  let n=seed;const next=(count:number)=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n%count;};
  const age=opts.child?8+next(6):22+next(48);
  const skin=race==='orc'?[0x6c8c54,0x7d9b66,0x4f764c][next(3)]!:race==='elf'?[0xefdac4,0xc9b29c,0xdec6b1][next(3)]!:SKIN[next(SKIN.length)]!;
  const hair=age>56?HAIR[7]!:HAIR[next(HAIR.length)]!;
  const body=opts.soldier?[0x4a5c70,0x56687b,0x647482,0x3d4f65][next(4)]!:CLOTHES[next(CLOTHES.length)]!;
  // A distinct, visible woven trim is retained in every facing row.
  const trim=((121+(seed&31))<<16)|((99+((seed>>>5)&31))<<8)|(65+((seed>>>10)&31));
  return {id,race,gender,age,skin,hair,body,trim,eye:[0x343a32,0x365664,0x594331][next(3)]!,
    hairStyle:next(6),faceShape:next(4),build:next(4),outfit:opts.soldier?4:next(4),accessory:next(5),seed};
}
export function residentIdentity(slot: number): string { return `haven-resident-${String(slot).padStart(3,'0')}`; }
export function residentPortraitId(slot: number): string { return `portrait_${residentIdentity(slot).replaceAll('-','_')}`; }
export function residentAppearance(slot: number): CitizenAppearance {
  const def=ALL_CITIZEN_DEFS[slot];if(!def)throw new Error(`Unknown resident ${slot}`);
  return citizenAppearance(residentIdentity(slot),{race:def.look==='orc'?'orc':def.look==='elf'||def.look==='hermit'?'elf':'human',
    gender:def.gender??(def.look==='mira'?'female':undefined),child:def.courtyardRole==='child',soldier:def.look==='captain'||Boolean(def.nightPatrolOnly&&def.look==='radio')});
}
const hex=(color:number)=>`#${color.toString(16).padStart(6,'0')}`;
export function citizenPortraitDescription(a: CitizenAppearance): string {
  const hair=['short cropped hair','curly hair','a long braid','a tied ponytail','a swept fringe','close shaved hair'][a.hairStyle];
  const faces=['oval face','broad square face','narrow angular face','round freckled face'][a.faceShape];
  const outfits=['a layered tunic','a practical vest over linen sleeves','a long belted coat','a woven shawl over a tunic','a city guard uniform and fitted steel shoulder armour'][a.outfit];
  return `${a.age} year old ${a.gender} ${a.race}, ${faces}, ${hair} in ${hex(a.hair)}, skin tone ${hex(a.skin)}, ${outfits} in ${hex(a.body)} with ${hex(a.trim)} embroidered trim, ${['slim','broad shouldered','stocky','tall slender'][a.build]} build, distinctive individual face, single person, historically grounded medieval clothing`;
}
