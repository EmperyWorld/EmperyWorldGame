/** Prompt chrome around an NPC sprite (label + ▼). */

export const NPC_LABEL_Y_OFF = 40;
export const NPC_PROP_LABEL_Y_OFF = 52;
export const NPC_MARKER_BASE_Y_OFF = 52;

/** Matches the old 700ms yoyo tween from y-52 to y-58. */
export function npcMarkerBobPx(nowMs: number): number {
  return 3 + 3 * Math.sin((nowMs * Math.PI) / 700);
}

export function npcPromptLayout(
  spriteX: number,
  spriteY: number,
  nowMs: number,
  opts?: { prop?: boolean },
): { labelX: number; labelY: number; markerX: number; markerY: number } {
  const labelOff = opts?.prop ? NPC_PROP_LABEL_Y_OFF : NPC_LABEL_Y_OFF;
  return {
    labelX: spriteX,
    labelY: spriteY - labelOff,
    markerX: spriteX,
    markerY: spriteY - NPC_MARKER_BASE_Y_OFF - npcMarkerBobPx(nowMs),
  };
}
