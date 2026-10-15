import { describe, expect, it } from 'vitest';
import { mountedLookId, resolveMountedLook, visualForMountId } from './mounted-look.js';

describe('mounted-look', () => {
  it('maps mount ids to visuals', () => {
    expect(visualForMountId('field_horse')).toBe('bay');
    expect(visualForMountId('ash_steed')).toBe('ash');
    expect(visualForMountId('pale_courser')).toBe('pale');
    expect(visualForMountId('prism_stallion')).toBe('prism');
  });

  it('builds distinct look ids for armor and cloak', () => {
    const base = resolveMountedLook({
      race: 'human',
      gender: 'male',
      profession: 'warrior',
      mountId: 'field_horse',
      armorType: 'light',
      cloakVariant: null,
      weaponKind: 'melee',
    });
    const heavy = resolveMountedLook({ ...base, armorType: 'heavy' });
    const cloaked = resolveMountedLook({ ...base, cloakVariant: 'shadow' });
    expect(mountedLookId(base)).not.toBe(mountedLookId(heavy));
    expect(mountedLookId(base)).not.toBe(mountedLookId(cloaked));
  });

  it('defaults mystic to robe when no body armor', () => {
    const look = resolveMountedLook({
      race: 'elf',
      gender: 'female',
      profession: 'mystic',
      mountId: 'prism_stallion',
      hasWeapon: true,
      rangedWeapon: true,
      rangedKind: 'magic',
    });
    expect(look.armorType).toBe('robe');
    expect(look.weaponKind).toBe('staff');
    expect(look.visual).toBe('prism');
  });
});
