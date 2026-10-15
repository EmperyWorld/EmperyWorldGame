import { z } from 'zod';

/** Survival fields on content items (YAML). Soft-required when present. */
export const ItemSurvivalSchema = z
  .object({
    nutrition: z.number().optional(),
    hydration: z.number().optional(),
    shelfLifeHours: z.number().positive().optional(),
    waterQuality: z.enum(['dirty', 'filtered', 'boiled', 'clean']).optional(),
    rawFood: z.boolean().optional(),
    warming: z.number().optional(),
    insulation: z.number().min(0).max(100).optional(),
    fuel: z.number().optional(),
    tool: z
      .enum(['filter', 'pot', 'firestarter', 'bandage', 'antibiotic', 'antipyretic'])
      .optional(),
    illnessChance: z.number().min(0).max(1).optional(),
  })
  .strict();

export const ItemContentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slot: z.string().min(1),
    rarity: z.string().min(1),
    stats: z.record(z.string(), z.number()).default({}),
    icon: z.string().optional(),
    weight: z.number().nonnegative().optional(),
    weaponWeight: z.enum(['light', 'normal', 'heavy']).optional(),
    weaponKind: z.enum(['melee', 'bow', 'staff']).optional(),
    attackRange: z.number().positive().optional(),
    armorType: z.enum(['light', 'heavy', 'robe']).optional(),
    unsellable: z.boolean().optional(),
    description: z.string().optional(),
    survival: ItemSurvivalSchema.optional(),
  })
  .passthrough();

export const LocationStationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['campfire', 'hearth', 'water', 'pot']),
  x: z.number().finite(),
  y: z.number().finite(),
  radius: z.number().finite().positive().optional(),
}).strict();

export const LocationClimateSchema = z
  .object({
    temperatureC: z.number().finite().optional(),
    humidity: z.number().finite().min(0).max(100).optional(),
    shelter: z.number().finite().min(0).max(100).optional(),
    water: z.enum(['none', 'dirty', 'clean']).optional(),
    heatSources: z
      .array(
        z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          radius: z.number().finite().positive().optional(),
        }).strict(),
      )
      .optional(),
  })
  .strict();

export const LocationNpcSchema = z
  .object({
    id: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    label: z.string().min(1),
    world: z
      .object({
        role: z.enum(['character', 'prop']),
        wanderRadius: z.number().finite().nonnegative().optional(),
        wanderSpeed: z.number().finite().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const LocationZoneSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    label: z.string().min(1),
    color: z.string().min(1).optional(),
    travelTo: z.string().min(1).optional(),
    arrival: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
    radius: z.number().finite().positive().optional(),
  })
  .strict();

export const LocationLandmarkSchema = z
  .object({
    kind: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const LocationEnemySpawnSchema = z
  .object({
    type: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    quest: z.boolean().optional(),
    level: z.number().finite().int().positive().optional(),
  })
  .strict();

export const LocationQuestSpawnSchema = z
  .object({
    activeFlag: z.string().min(1),
    killCounterFlag: z.string().min(1).optional(),
    banner: z.string().min(1).optional(),
    startBanner: z.string().min(1).optional(),
    enemies: z.array(LocationEnemySpawnSchema).min(1),
  })
  .strict();

export const LocationQuestCompleteSchema = z
  .object({
    anyFlag: z.array(z.string().min(1)).min(1),
    banner: z.string().min(1),
  })
  .strict();

export const LocationFarmSpawnSchema = z
  .object({
    type: z.string().min(1),
    maxAlive: z.number().finite().int().positive(),
    respawnMs: z.number().finite().int().positive().optional(),
    level: z.number().finite().int().positive().optional(),
    points: z
      .array(
        z
          .object({
            x: z.number().finite(),
            y: z.number().finite(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const LocationContentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    subtitle: z.string().min(1).optional(),
    description: z.string(),
    mapKey: z.string().min(1),
    backgroundAsset: z.string().min(1),
    anomalyTier: z.number().finite().int().min(1).max(4).optional(),
    tierLabel: z.string().min(1).optional(),
    recommendedLevel: z
      .object({
        min: z.number().finite().int().nonnegative(),
        max: z.number().finite().int().nonnegative(),
      })
      .strict()
      .refine((value) => value.max >= value.min, {
        message: 'max must be greater than or equal to min',
        path: ['max'],
      })
      .optional(),
    spawn: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .strict(),
    safeZone: z.boolean().optional(),
    privateOwnerOnly: z.boolean().optional(),
    requires: z
      .object({
        anyFlag: z.array(z.string().min(1)).min(1).optional(),
        denyMessage: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    raceHint: z.string().min(1).optional(),
    dayNight: z.enum(['outdoor', 'indoor', 'dungeon']).optional(),
    survivalClimate: LocationClimateSchema.optional(),
    stations: z.array(LocationStationSchema).optional(),
    seagulls: z
      .array(
        z
          .object({
            id: z.string().min(1),
            x: z.number().finite(),
            y: z.number().finite(),
          })
          .strict(),
      )
      .optional(),
    npcs: z.array(LocationNpcSchema).optional(),
    zones: z.array(LocationZoneSchema).optional(),
    landmarks: z.array(LocationLandmarkSchema).optional(),
    enemies: z.array(LocationEnemySpawnSchema).optional(),
    farmSpawn: LocationFarmSpawnSchema.optional(),
    questSpawns: z.array(LocationQuestSpawnSchema).optional(),
    questComplete: z.array(LocationQuestCompleteSchema).optional(),
  })
  .strict();

export type ItemContent = z.infer<typeof ItemContentSchema>;
export type LocationContent = z.infer<typeof LocationContentSchema>;

export function parseItemContent(raw: unknown): { ok: true; data: ItemContent } | { ok: false; error: string } {
  const parsed = ItemContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, data: parsed.data };
}

export function parseLocationContent(
  raw: unknown,
): { ok: true; data: LocationContent } | { ok: false; error: string } {
  const parsed = LocationContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, data: parsed.data };
}
