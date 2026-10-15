import type { MediaJobRequest } from '@empery/shared';

export const MEDIA_CATEGORY_IDS = [
  'all',
  'items',
  'skills',
  'props',
  'portraits',
  'locations',
  'terrain',
  'sprites',
] as const;

export type MediaCategoryId = (typeof MEDIA_CATEGORY_IDS)[number];

export interface MediaCategoryDefinition {
  id: MediaCategoryId;
  profiles: readonly MediaJobRequest['profile'][];
}

export const MEDIA_CATEGORY_DEFINITIONS: readonly MediaCategoryDefinition[] = [
  { id: 'all', profiles: [] },
  { id: 'items', profiles: ['item_icon'] },
  { id: 'skills', profiles: ['skill_icon'] },
  { id: 'props', profiles: ['prop_sprite', 'ship_sprite'] },
  {
    id: 'portraits',
    profiles: ['character_sheet', 'portrait_npc', 'dialogue_portrait'],
  },
  { id: 'locations', profiles: ['location_bg'] },
  { id: 'terrain', profiles: ['tileset', 'terrain_tile'] },
  { id: 'sprites', profiles: ['game_sprite'] },
] as const;

export function isMediaCategoryId(value: string): value is MediaCategoryId {
  return MEDIA_CATEGORY_IDS.includes(value as MediaCategoryId);
}

export function profileInMediaCategory(
  profile: MediaJobRequest['profile'],
  category: MediaCategoryId,
): boolean {
  if (category === 'all') return true;
  const definition = MEDIA_CATEGORY_DEFINITIONS.find((entry) => entry.id === category);
  return Boolean(definition?.profiles.includes(profile));
}

export function mediaCategoryForProfile(
  profile: MediaJobRequest['profile'],
): Exclude<MediaCategoryId, 'all'> {
  const definition = MEDIA_CATEGORY_DEFINITIONS.find(
    (entry) => entry.id !== 'all' && entry.profiles.includes(profile),
  );
  if (!definition || definition.id === 'all') {
    throw new Error(`Media profile has no category: ${profile}`);
  }
  return definition.id;
}
