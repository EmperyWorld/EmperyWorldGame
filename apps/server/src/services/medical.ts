import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  PlayerSave,
  SurvivalConditionId,
  SurvivalSeverity,
  SurvivalState,
} from '@empery/shared';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

export interface ConditionModifiers {
  speed?: number;
  accuracy?: number;
  stamina?: number;
  hpRegen?: number;
}

export interface ConditionDefinition {
  id: SurvivalConditionId;
  name: string;
  kind: 'deficit' | 'illness' | 'injury';
  uiHint?: string;
  stabilize?: 'heat';
  stages?: string[];
  cures?: { tools?: string[]; npc?: string };
  modifiers?: {
    deficit?: ConditionModifiers;
    critical?: ConditionModifiers;
  };
}

interface TreatmentCatalog {
  conditions: ConditionDefinition[];
  treatments: Record<string, { removes: SurvivalConditionId[] }>;
  npcCare: Record<
    string,
    {
      costAdena: number;
      removesKinds: Array<'illness' | 'injury' | 'deficit'>;
      restores?: { satiety?: number; hydration?: number; fatigue?: number };
      messageOk: string;
      messageNothing: string;
      messagePoor: string;
    }
  >;
}

const FALLBACK: TreatmentCatalog = {
  conditions: [],
  treatments: {
    bandage: { removes: ['exhaustion_injury', 'frostbite'] },
    antibiotic: { removes: ['infection', 'food_poisoning'] },
    antipyretic: { removes: ['heatstroke', 'hyperthermia'] },
  },
  npcCare: {
    town_healer: {
      costAdena: 45,
      removesKinds: ['illness', 'injury'],
      restores: { satiety: 8, hydration: 8, fatigue: -18 },
      messageOk: 'Лечение проведено.',
      messageNothing: 'Лечение не требуется.',
      messagePoor: 'Не хватает адены.',
    },
  },
};

let cache: TreatmentCatalog | null = null;

function loadCatalog(): TreatmentCatalog {
  if (cache) return cache;
  try {
    const raw = parseYaml(readFileSync(join(contentRoot, 'world/conditions.yaml'), 'utf8')) as TreatmentCatalog;
    cache = {
      conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
      treatments: raw.treatments ?? FALLBACK.treatments,
      npcCare: raw.npcCare ?? FALLBACK.npcCare,
    };
  } catch {
    cache = FALLBACK;
  }
  return cache;
}

export function conditionDefinition(id: SurvivalConditionId): ConditionDefinition | undefined {
  return loadCatalog().conditions.find((c) => c.id === id);
}

export function conditionDisplayName(id: SurvivalConditionId): string {
  return conditionDefinition(id)?.name ?? id;
}

export function conditionUiHint(id: SurvivalConditionId): string | undefined {
  return conditionDefinition(id)?.uiHint;
}

export function treatmentRemoves(tool: string): SurvivalConditionId[] {
  return loadCatalog().treatments[tool]?.removes ?? [];
}

/** Multiply active condition modifiers (worst-of stacking via min). */
export function conditionStatMultipliers(
  conditions: Array<{ id: SurvivalConditionId; severity: SurvivalSeverity; stage?: 'mild' | 'acute' }>,
): { speed: number; accuracy: number; stamina: number; hpRegen: number } {
  let speed = 1;
  let accuracy = 1;
  let stamina = 1;
  let hpRegen = 1;
  for (const entry of conditions) {
    if (entry.severity === 'normal') continue;
    const tier =
      entry.severity === 'critical' || entry.stage === 'acute' ? 'critical' : 'deficit';
    const mods = conditionDefinition(entry.id)?.modifiers?.[tier];
    if (!mods) continue;
    if (typeof mods.speed === 'number') speed = Math.min(speed, mods.speed);
    if (typeof mods.accuracy === 'number') accuracy = Math.min(accuracy, mods.accuracy);
    if (typeof mods.stamina === 'number') stamina = Math.min(stamina, mods.stamina);
    if (typeof mods.hpRegen === 'number') hpRegen = Math.min(hpRegen, mods.hpRegen);
  }
  return { speed, accuracy, stamina, hpRegen };
}

export interface NpcCareResult {
  ok: boolean;
  save: PlayerSave;
  message: string;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function treatAtNpc(
  save: PlayerSave,
  npcId: string,
  state: SurvivalState,
  now = Date.now(),
): NpcCareResult {
  const care = loadCatalog().npcCare[npcId];
  if (!care) return { ok: false, save, message: 'Этот NPC не оказывает лечение.' };
  const treatable = state.conditions.filter((c) => care.removesKinds.includes(c.kind));
  if (treatable.length === 0) {
    return { ok: false, save, message: care.messageNothing };
  }
  const adena = save.adena ?? 0;
  if (adena < care.costAdena) {
    return { ok: false, save, message: care.messagePoor };
  }
  const removeIds = new Set(treatable.map((c) => c.id));
  const restores = care.restores ?? {};
  const nextState: SurvivalState = {
    ...state,
    satiety: clamp(state.satiety + (restores.satiety ?? 0)),
    hydration: clamp(state.hydration + (restores.hydration ?? 0)),
    fatigue: clamp(state.fatigue + (restores.fatigue ?? 0)),
    conditions: state.conditions.filter((c) => !removeIds.has(c.id)),
    events: [
      ...state.events,
      {
        at: new Date(now).toISOString(),
        type: 'treatment' as const,
        message: care.messageOk,
      },
    ].slice(-12),
  };
  return {
    ok: true,
    save: applyStatsToSave({
      ...save,
      adena: adena - care.costAdena,
      survival: nextState,
    }),
    message: care.messageOk,
  };
}

export function listActiveConditionHints(
  conditions: Array<{ id: SurvivalConditionId; severity: SurvivalSeverity }>,
): string[] {
  return conditions.map((c) => {
    const name = conditionDisplayName(c.id);
    const hint = conditionUiHint(c.id);
    return hint ? `${name}: ${hint}` : name;
  });
}
