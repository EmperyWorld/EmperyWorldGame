import { describe, expect, it } from 'vitest';
import { isCitizenDialogueFallthrough } from './haven-npc-plugin.js';

describe('isCitizenDialogueFallthrough', () => {
  it.each([
    'citizen_rumors',
    'citizen_advice',
    'citizen_directions',
    'citizen_leave',
    'dir_blacksmith',
    'dir_harbor',
  ])('routes %s through the central citizen dialogue handler', (choiceId) => {
    expect(isCitizenDialogueFallthrough(choiceId)).toBe(true);
  });

  it('keeps district mechanics inside their plugins', () => {
    expect(isCitizenDialogueFallthrough('plaza_coin')).toBe(false);
    expect(isCitizenDialogueFallthrough('craft_bellows')).toBe(false);
  });
});
