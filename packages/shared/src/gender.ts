import type { PlayerGender } from './types.js';

export function normalizeGender(value: unknown): PlayerGender {
  return value === 'female' ? 'female' : 'male';
}
