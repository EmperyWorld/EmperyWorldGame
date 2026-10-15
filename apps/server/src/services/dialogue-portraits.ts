import type { DialogueChoice, DialogueResponse } from '@empery/shared';
import { dialoguePortraitId, resolveDialoguePortrait } from '@empery/shared';

export interface NpcPortraits {
  default?: string;
  [pose: string]: string | undefined;
}

export interface NpcChoiceLike {
  id?: string;
  portrait?: string;
  nextNode?: string;
  flag?: string;
}

export interface NpcNodeLike {
  portrait?: string;
}

export function withDialogueScene(
  npc: { id: string; name: string; portraits?: NpcPortraits },
  partial: Omit<DialogueResponse, 'npcId' | 'npcName'> & { portrait?: string },
): DialogueResponse {
  const response: DialogueResponse = {
    npcId: npc.id,
    npcName: npc.name,
    text: partial.text,
    choices: partial.choices,
    portrait: resolveDialoguePortrait(npc.id, npc.portraits, partial.portrait ?? 'default'),
  };
  if (partial.navigationTarget) {
    response.navigationTarget = partial.navigationTarget;
  }
  return response;
}

export function portraitForChoice(
  npc: { id: string; portraits?: NpcPortraits },
  choice?: NpcChoiceLike,
  fallbackPose = 'neutral',
): string {
  if (choice?.portrait) {
    return resolveDialoguePortrait(npc.id, npc.portraits, choice.portrait);
  }
  return resolveDialoguePortrait(npc.id, npc.portraits, fallbackPose);
}

export function portraitForNode(
  npc: { id: string; portraits?: NpcPortraits },
  node?: NpcNodeLike,
  choice?: NpcChoiceLike,
): string {
  if (node?.portrait) {
    return resolveDialoguePortrait(npc.id, npc.portraits, node.portrait);
  }
  return portraitForChoice(npc, choice, 'serious');
}

/** Портрет для превью при наведении на вариант ответа. */
export function previewPortraitForChoice(
  npc: {
    id: string;
    portraits?: NpcPortraits;
    nodes?: Record<string, NpcNodeLike>;
  },
  choice: NpcChoiceLike,
): string {
  if (choice.nextNode && npc.nodes?.[choice.nextNode]) {
    return portraitForNode(npc, npc.nodes[choice.nextNode], choice);
  }
  if (choice.flag === '_shop_buy') {
    return resolveDialoguePortrait(npc.id, npc.portraits, 'trade');
  }
  if (choice.flag === '_inn_rest') {
    return resolveDialoguePortrait(npc.id, npc.portraits, 'happy');
  }
  if (choice.id?.startsWith('forge_') && choice.id !== 'forge_leave') {
    return resolveDialoguePortrait(npc.id, npc.portraits, 'work');
  }
  return portraitForChoice(npc, choice);
}

export function mapDialogueChoices(
  npc: {
    id: string;
    portraits?: NpcPortraits;
    nodes?: Record<string, NpcNodeLike>;
  },
  choices: Array<{ id: string; label: string } & NpcChoiceLike>,
): DialogueChoice[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    portrait: previewPortraitForChoice(npc, choice),
  }));
}

/** Квестовые состояния → типичная эмоция портрета.
 *  complete → action (не happy): у многих NPC happy ещё не сгенерирован. */
export function questStatePortrait(npcId: string, state: 'active' | 'complete' | 'brief'): string {
  if (state === 'complete') return dialoguePortraitId(npcId, 'action');
  if (state === 'active') return dialoguePortraitId(npcId, 'serious');
  return dialoguePortraitId(npcId, 'serious');
}
