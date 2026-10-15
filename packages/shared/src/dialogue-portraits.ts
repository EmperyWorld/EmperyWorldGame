/** ID ассета портрета для сцены диалога: dialogue_{npcId}_{pose}. */
export function dialoguePortraitId(npcId: string, pose = 'neutral'): string {
  return `dialogue_${npcId}_${pose}`;
}

function resolveMood(
  npcId: string,
  portraits: Record<string, string | undefined> | undefined,
  mood: string,
): string {
  if (mood.startsWith('dialogue_')) return mood;
  const mapped = portraits?.[mood];
  if (mapped?.startsWith('dialogue_')) return mapped;
  return dialoguePortraitId(npcId, mood);
}

/** pose — ключ эмоции из portraits в YAML, `default`, или полный asset id. */
export function resolveDialoguePortrait(
  npcId: string,
  portraits: Record<string, string | undefined> | undefined,
  pose?: string,
): string {
  if (!pose || pose === 'default') {
    const mood = portraits?.default ?? 'neutral';
    return resolveMood(npcId, portraits, mood);
  }
  return resolveMood(npcId, portraits, pose);
}
