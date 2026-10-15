import type { PlayerSave } from '../../api.js';

export function questFlagsChanged(
  prev: PlayerSave['questFlags'],
  next: PlayerSave['questFlags'],
): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (prev[k] !== next[k]) return true;
  }
  return false;
}
