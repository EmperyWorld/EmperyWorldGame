/**
 * Contract for Haven NPC feature plugins.
 * Feature modules implement generate/apply; DialogueService wires them.
 * Do not add feature logic here — keep this file types-only.
 */
import type { DialogueResponse, PlayerSave } from '@empery/shared';

export interface HavenNpcChoice {
  id: string;
  label: string;
  flag: string;
  nextNode?: string;
  blocks?: string[];
  portrait?: string;
}

export interface HavenNpcNode {
  text: string;
  choices: HavenNpcChoice[];
  portrait?: string;
}

export interface HavenNpcLike {
  id: string;
  name: string;
  defaultGreeting: string;
  portraits?: Record<string, string | undefined>;
  choices: HavenNpcChoice[];
  nodes: Record<string, HavenNpcNode>;
}

export interface HavenNpcChoiceResult {
  save: PlayerSave;
  followUp?: DialogueResponse;
  townMessage?: string;
}

/** Isolated Haven NPC feature: generate/apply return null to fall through to YAML/LLM. */
export interface HavenNpcFeaturePlugin {
  generate(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null;
  apply(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null;
}

export function hasHavenFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

const CITIZEN_DIALOGUE_FALLTHROUGH_IDS = new Set([
  'citizen_rumors',
  'citizen_advice',
  'citizen_directions',
  'citizen_leave',
]);

/** Flavor/navigation choices are handled centrally by DialogueService. */
export function isCitizenDialogueFallthrough(choiceId: string): boolean {
  return CITIZEN_DIALOGUE_FALLTHROUGH_IDS.has(choiceId) || choiceId.startsWith('dir_');
}

export function filterHavenChoices<T extends { blocks?: string[] }>(
  choices: T[],
  save: PlayerSave,
): T[] {
  return choices.filter((choice) => {
    if (!choice.blocks?.length) return true;
    return !choice.blocks.some((flag) => hasHavenFlag(save, flag));
  });
}
