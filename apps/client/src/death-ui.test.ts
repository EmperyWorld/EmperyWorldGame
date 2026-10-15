import { describe, expect, it } from 'vitest';
import {
  deathTitle,
  isSurvivalCollapseCause,
  isSurvivalDoomCause,
  respawnButtonLabel,
} from './death-ui.js';

describe('death kind copy', () => {
  it('detects faint vs Гибель vs combat', () => {
    expect(isSurvivalCollapseCause('Потерял сознание: голод. После воскрешения потребуется лечение.')).toBe(
      true,
    );
    expect(isSurvivalDoomCause('Гибель: усталость. Повторный обморок при невылеченной травме.')).toBe(true);
    expect(isSurvivalDoomCause('Потерял сознание: голод.', 'doom')).toBe(true);
    expect(isSurvivalCollapseCause('Убит мобом (wolf, ур.3)')).toBe(false);
    expect(isSurvivalDoomCause('Убит мобом (wolf, ур.3)')).toBe(false);
    expect(isSurvivalCollapseCause(null)).toBe(false);
  });

  it('labels the haven button with the matching XP cut', () => {
    expect(deathTitle('doom')).toBe('Гибель');
    expect(respawnButtonLabel('combat')).toBe('В Гавань (−25% XP)');
    expect(respawnButtonLabel('doom')).toBe('В Гавань (−40% XP)');
  });
});
