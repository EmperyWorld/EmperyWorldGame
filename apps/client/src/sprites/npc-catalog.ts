import { EMPERY_FOUNDERS, EMPERY_RECEPTIONIST_APPEARANCE, type CitizenAppearance } from '@empery/shared';
/**
 * World-layer NPC catalog — one entry per interactive character id.
 * No aliases: each id has its own palette, props, and default locomotion.
 * Furniture (`apartment_*`) is role:prop and does not appear here.
 */
export type NpcRole = 'character' | 'prop';

export interface NpcPalette {
  skin: number;
  hair: number;
  body: number;
  trim: number;
  weapon: number;
  eye: number;
}

export interface NpcWorldDef {
  id: string;
  palette: NpcPalette;
  appearance?: CitizenAppearance;
  seated?: boolean;
  /** Visual extras drawn on top of the base top-down body. */
  prop:
    | 'laptop'
    | 'staff'
    | 'leaf'
    | 'sash'
    | 'coin'
    | 'apron'
    | 'spear'
    | 'hammer'
    | 'radio'
    | 'brush'
    | 'book'
    | 'fish'
    | 'cleaver'
    | 'crate'
    | 'towel'
    | 'mug'
    | 'sack'
    | 'mortar'
    | 'scroll'
    | 'key'
    | 'none';
  hood?: boolean;
  ears?: boolean;
  big?: boolean;
  /** Default wander if YAML omits world.wanderRadius (px). 0 = rooted. */
  wanderRadius: number;
  wanderSpeed: number;
}

const P = (
  skin: number,
  hair: number,
  body: number,
  trim: number,
  weapon: number,
  eye: number,
): NpcPalette => ({ skin, hair, body, trim, weapon, eye });

/** All talkable character NPCs — keep in sync with content/npcs/*.yaml (non-prop). */
export const NPC_WORLD_CATALOG: Record<string, NpcWorldDef> = {
  elder_mira: {
    id: 'elder_mira',
    palette: P(0xe8c8a0, 0x888888, 0x6a5040, 0xc9a66b, 0x8b6914, 0x333333),
    prop: 'staff',
    wanderRadius: 36,
    wanderSpeed: 22,
  },
  silvan_hermit: {
    id: 'silvan_hermit',
    palette: P(0xe8d8c8, 0xc0c0c0, 0x3d5a40, 0x7cb87c, 0x6b8c5a, 0x2a5a2a),
    prop: 'leaf',
    ears: true,
    wanderRadius: 48,
    wanderSpeed: 20,
  },
  ash_shaman: {
    id: 'ash_shaman',
    palette: P(0x7a9a6a, 0x1a1a1a, 0x5a3030, 0xcc6644, 0xaa8866, 0xff6622),
    prop: 'sash',
    hood: true,
    big: true,
    wanderRadius: 40,
    wanderSpeed: 24,
  },
  town_merchant: {
    id: 'town_merchant',
    palette: P(0xe8c0a0, 0x553322, 0x7a5030, 0xffcc44, 0xaa7722, 0x333333),
    prop: 'coin',
    wanderRadius: 44,
    wanderSpeed: 26,
  },
  town_innkeeper: {
    id: 'town_innkeeper',
    palette: P(0xf0d0b0, 0x884422, 0x6a4038, 0xdd8866, 0x888888, 0x443322),
    prop: 'apron',
    wanderRadius: 32,
    wanderSpeed: 22,
  },
  town_innkeeper_day: {
    id: 'town_innkeeper_day',
    palette: P(0xd8c0a0, 0x3a2818, 0x4a5060, 0x8899aa, 0x888888, 0x332211),
    prop: 'mug',
    wanderRadius: 28,
    wanderSpeed: 22,
  },
  town_captain: {
    id: 'town_captain',
    palette: P(0xd8b890, 0x333333, 0x445566, 0x8899aa, 0xcccccc, 0x222222),
    prop: 'spear',
    wanderRadius: 28,
    wanderSpeed: 24,
  },
  town_blacksmith: {
    id: 'town_blacksmith',
    palette: P(0xc8a080, 0x2a2018, 0x4a4038, 0x886644, 0x888888, 0x332211),
    prop: 'hammer',
    wanderRadius: 36,
    wanderSpeed: 20,
  },
  town_radio: {
    id: 'town_radio',
    palette: P(0xd0c0a8, 0x2a3a48, 0x3a5048, 0x6aaa88, 0x88aacc, 0x224433),
    prop: 'radio',
    wanderRadius: 40,
    wanderSpeed: 26,
  },
  town_stable: {
    id: 'town_stable',
    palette: P(0xe0b898, 0x4a3020, 0x6a5040, 0xc9a66b, 0x8a6840, 0x332211),
    prop: 'brush',
    wanderRadius: 52,
    wanderSpeed: 28,
  },
  town_priest: {
    id: 'town_priest',
    palette: P(0xe8dcc8, 0xf0f0f0, 0x5a5048, 0xd4c4a0, 0x8b6914, 0x444433),
    prop: 'staff',
    wanderRadius: 30,
    wanderSpeed: 18,
  },
  town_scribe: {
    id: 'town_scribe',
    palette: P(0xe0d0b8, 0x3a3a48, 0x4a5a68, 0xa0b0c0, 0x886644, 0x333344),
    prop: 'book',
    wanderRadius: 28,
    wanderSpeed: 18,
  },
  town_guard: {
    id: 'town_guard',
    palette: P(0xd0b090, 0x2a2a2a, 0x3a4a5a, 0x6a7a8a, 0xb0b0b0, 0x222222),
    prop: 'spear',
    wanderRadius: 64,
    wanderSpeed: 32,
  },
  town_fisher: {
    id: 'town_fisher',
    palette: P(0xc8b098, 0x3a4a58, 0x3a5a68, 0x6a9aaa, 0x8a6840, 0x223344),
    prop: 'fish',
    wanderRadius: 48,
    wanderSpeed: 26,
  },
  town_butcher: {
    id: 'town_butcher',
    palette: P(0xe0b8a0, 0x2a1810, 0x6a3030, 0xc85848, 0x888888, 0x442222),
    prop: 'cleaver',
    wanderRadius: 36,
    wanderSpeed: 22,
  },
  town_dockhand: {
    id: 'town_dockhand',
    palette: P(0xc8a888, 0x1a1a1a, 0x4a4838, 0x8a7850, 0x666666, 0x332211),
    prop: 'crate',
    wanderRadius: 56,
    wanderSpeed: 30,
  },
  harbor_skipper_barge: {
    id: 'harbor_skipper_barge',
    palette: P(0xc8a888, 0x2a2018, 0x4a4030, 0x8a7850, 0x666666, 0x332211),
    prop: 'crate',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  harbor_skipper_cog: {
    id: 'harbor_skipper_cog',
    palette: P(0xd0b090, 0x3a2818, 0x5a4030, 0xc9a66b, 0x886644, 0x332211),
    prop: 'sack',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  harbor_skipper_fishing: {
    id: 'harbor_skipper_fishing',
    palette: P(0xc8b090, 0x1a1a1a, 0x3a4a58, 0x88aacc, 0x6688aa, 0x223344),
    prop: 'fish',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  harbor_skipper_caravel: {
    id: 'harbor_skipper_caravel',
    palette: P(0xe0c8a8, 0x2a1810, 0x3a4058, 0xd4b060, 0x8b6914, 0x224455),
    prop: 'scroll',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  harbor_skipper_ferry: {
    id: 'harbor_skipper_ferry',
    palette: P(0xe0c0a0, 0x5a3820, 0x4a5860, 0x88aacc, 0x666666, 0x332211),
    prop: 'key',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  harbor_skipper_skiff: {
    id: 'harbor_skipper_skiff',
    palette: P(0xd0b898, 0x4a3a30, 0x4a4838, 0x8a7850, 0x886644, 0x332211),
    prop: 'none',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  harbor_skipper_brig: {
    id: 'harbor_skipper_brig',
    palette: P(0xc8a888, 0x1a1a1a, 0x2a3040, 0xc9a66b, 0x888888, 0x224455),
    prop: 'spear',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  town_bathkeeper: {
    id: 'town_bathkeeper',
    palette: P(0xf0d8c0, 0x886655, 0x8a7060, 0xe8d0b0, 0xffffff, 0x443322),
    prop: 'towel',
    wanderRadius: 28,
    wanderSpeed: 18,
  },
  town_brewer: {
    id: 'town_brewer',
    palette: P(0xe0c0a0, 0x5a3820, 0x5a4030, 0xc9a66b, 0xaa7722, 0x332211),
    prop: 'mug',
    wanderRadius: 40,
    wanderSpeed: 22,
  },
  town_miller: {
    id: 'town_miller',
    palette: P(0xe8d0b0, 0xc8c0b0, 0x8a7a60, 0xd4c4a0, 0x886644, 0x443322),
    prop: 'sack',
    wanderRadius: 44,
    wanderSpeed: 24,
  },
  town_healer: {
    id: 'town_healer',
    palette: P(0xe8d8c8, 0xb0a090, 0x5a7060, 0x88aa88, 0xc9a66b, 0x334433),
    prop: 'mortar',
    wanderRadius: 32,
    wanderSpeed: 20,
  },
  town_teacher: {
    id: 'town_teacher',
    palette: P(0xe0d0c0, 0x4a3a30, 0x4a5068, 0xa0a8c0, 0x886644, 0x333344),
    prop: 'scroll',
    wanderRadius: 36,
    wanderSpeed: 20,
  },
  town_steward: {
    id: 'town_steward',
    palette: P(0xe8d0b8, 0x2a2a2a, 0x3a3848, 0xc9a66b, 0xd4b060, 0x333333),
    prop: 'key',
    wanderRadius: 40,
    wanderSpeed: 24,
  },
  town_gardener: {
    id: 'town_gardener',
    palette: P(0xd8c098, 0x6a5840, 0x4a6a3a, 0x88aa66, 0x8b6914, 0x334422),
    prop: 'leaf',
    wanderRadius: 15,
    wanderSpeed: 15,
  },
  town_informant: {
    id: 'town_informant',
    palette: P(0xc8b090, 0x1a1a1a, 0x2a2838, 0x6a5a78, 0x886644, 0x443355),
    prop: 'coin',
    hood: true,
    wanderRadius: 5,
    wanderSpeed: 10,
  },
  town_hq_sentry: {
    id: 'town_hq_sentry',
    palette: P(0xc8d0d8, 0x1a1a1a, 0x2a3848, 0x4ec5e8, 0x8899aa, 0x223344),
    prop: 'spear',
    hood: true,
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  town_hq_receptionist: {
    id: 'town_hq_receptionist',
    appearance: EMPERY_RECEPTIONIST_APPEARANCE,
    palette: P(0xf1c6a4, 0xb85c26, 0x2a3848, 0x4ec5e8, 0xc0d0d8, 0x365a3a),
    prop: 'scroll',
    wanderRadius: 0,
    wanderSpeed: 0,
  },
  ...Object.fromEntries(EMPERY_FOUNDERS.map(founder => [founder.id, {
    id: founder.id,
    palette: P(founder.appearance.skin, founder.appearance.hair, founder.appearance.body, founder.appearance.trim, 0x88bbcc, founder.appearance.eye),
    appearance: founder.appearance,
    seated: true,
    prop: founder.id === 'town_hq_founder_pot' ? 'laptop' as const : 'none' as const,
    wanderRadius: 0,
    wanderSpeed: 0,
  }])),
  town_hq_researcher: {
    id: 'town_hq_researcher',
    palette: P(0xe0d4c8, 0x4a4a50, 0xd0d8e0, 0x3aa0c8, 0x88bbcc, 0x224455),
    prop: 'book',
    wanderRadius: 16,
    wanderSpeed: 14,
  },
  rift_scout: {
    id: 'rift_scout',
    palette: P(0xb8a888, 0x1a1a1a, 0x3a4050, 0x6688aa, 0xcccccc, 0x2244aa),
    prop: 'spear',
    wanderRadius: 52,
    wanderSpeed: 34,
  },
  rift_guide: {
    id: 'rift_guide',
    palette: P(0xd0c8b8, 0x888888, 0x4a5860, 0x88aacc, 0x6b8c5a, 0x335566),
    prop: 'staff',
    wanderRadius: 40,
    wanderSpeed: 22,
  },
  collapse_seer: {
    id: 'collapse_seer',
    palette: P(0x8a9a7a, 0x1a1010, 0x4a2828, 0xaa5533, 0xaa8866, 0xff4422),
    prop: 'sash',
    hood: true,
    wanderRadius: 36,
    wanderSpeed: 20,
  },
  gods_oracle: {
    id: 'gods_oracle',
    palette: P(0xe8e0d0, 0xf0e8d0, 0x6a6080, 0xd4b060, 0x8b6914, 0x554488),
    prop: 'staff',
    wanderRadius: 24,
    wanderSpeed: 16,
  },
};

export const NPC_CHARACTER_IDS = Object.keys(NPC_WORLD_CATALOG);

export function npcWorldDef(npcId: string): NpcWorldDef | undefined {
  return NPC_WORLD_CATALOG[npcId];
}

export function npcIsProp(npcId: string): boolean {
  return (
    npcId.startsWith('apartment_') ||
    npcId === 'town_hq_terminal' ||
    npcId === 'town_notice_board' ||
    npcId === 'stage_bard'
  );
}

export function npcFramePrefix(npcId: string): string {
  return `npc-${npcId}`;
}

export function npcAnimPrefix(npcId: string): string {
  return `npc-${npcId}`;
}
