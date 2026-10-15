import { citizenAppearance, type CitizenAppearance } from './citizen-appearance.js';

/** The authors' identities are shared by the world sprite and media catalog. */
export interface EmperyFounder {
  id: string;
  name: string;
  post: { x: number; y: number };
  appearance: CitizenAppearance;
  portraitLook: string;
}

export const EMPERY_FOUNDERS: readonly EmperyFounder[] = [
  {
    id: 'town_hq_founder_lady_boss',
    name: 'Lady_Boss',
    post: { x: 384, y: 598 },
    appearance: {
      ...citizenAppearance('town_hq_founder_lady_boss', { gender: 'female' }),
      age: 28, skin: 0xe8ba91, hair: 0x553824, hairStyle: 1,
      body: 0x413c68, trim: 0xb39864, outfit: 2, accessory: 3, faceShape: 0, build: 0,
    },
    portraitLook: 'one strikingly beautiful adult woman aged 28, charismatic creative director, long voluminous naturally curly chestnut-brown hair cascading over her shoulders, warm hazel eyes, elegant oval face, confident warm smile, refined natural makeup, tailored deep plum blazer over cream blouse, discreet gold jewellery, modern creative studio with glass walls and a design table, elegant and professional',
  },
  {
    id: 'town_hq_founder_pot',
    name: 'po&T',
    post: { x: 896, y: 598 },
    appearance: {
      ...citizenAppearance('town_hq_founder_pot', { gender: 'male' }),
      age: 38, skin: 0xdca781, hair: 0x221b18, hairStyle: 5,
      body: 0x35424b, trim: 0x77949b, outfit: 1, accessory: 0, faceShape: 1, build: 1,
    },
    portraitLook: 'one adult man aged 38, completely bald shaved scalp with no hair, full thick neatly groomed dark beard and moustache, broad shoulders, warm brown eyes, strong square face, approachable confident expression, dark graphite casual technical jacket over a black shirt, modern engineering studio with a workbench and softly blurred monitors, realistic natural skin texture',
  },
];

export const EMPERY_RECEPTIONIST_APPEARANCE: CitizenAppearance = {
  ...citizenAppearance('town_hq_receptionist', { gender: 'female' }),
  age: 22, skin: 0xf1c6a4, hair: 0xb85c26, hairStyle: 1,
  body: 0x2a3848, trim: 0x4ec5e8, outfit: 1, accessory: 3, faceShape: 0, build: 0,
  seed: 22071397,
};
