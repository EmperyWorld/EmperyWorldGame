import { describe, expect, it } from 'vitest';
import { enforceMountForLocation } from './mounts.js';

const mountedSave = {
  id: 's1',
  mount: { ownedId: 'field_horse', mounted: true, chargeUntil: null, stamina: 1000, staminaAt: null },
} as import('@empery/shared').PlayerSave;

describe('enforceMountForLocation', () => {
  it('dismounts in private indoor apartment', () => {
    const next = enforceMountForLocation(mountedSave, {
      privateOwnerOnly: true,
      dayNight: 'indoor',
    });
    expect(next.mount?.mounted).toBe(false);
  });

  it('keeps mount outdoors', () => {
    const next = enforceMountForLocation(mountedSave, {
      dayNight: 'outdoor',
    });
    expect(next.mount?.mounted).toBe(true);
  });
});
