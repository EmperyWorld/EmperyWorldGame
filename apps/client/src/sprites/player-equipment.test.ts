import { describe, expect, it } from 'vitest';
import {
  playerAnimToCloakAnim,
  playerAnimToShieldAnim,
  playerAnimToWeaponAnim,
  cloakVariantForItem,
  weaponOverlayForSave,
} from './player-equipment.js';

describe('playerAnimToCloakAnim', () => {
  it('maps directional walk to cloak walk facing', () => {
    expect(playerAnimToCloakAnim('player-elf-walk-down-side', 'traveler', 'down-side')).toBe(
      'cloak-traveler-walk-down-side',
    );
    expect(playerAnimToCloakAnim('player-human-walk-up', 'shadow', 'up')).toBe('cloak-shadow-walk-up');
  });

  it('keeps idle directional and attack on the base sheet', () => {
    expect(playerAnimToCloakAnim('player-orc-idle', 'daedric', 'down')).toBe('cloak-daedric-idle-down');
    expect(playerAnimToShieldAnim('player-human-attack', 'iron')).toBe('shield-iron-attack');
  });

  it('maps female walk keys to cloak walk facing', () => {
    expect(playerAnimToCloakAnim('player-elf-f-walk-down-side', 'traveler', 'down-side')).toBe(
      'cloak-traveler-walk-down-side',
    );
    expect(playerAnimToCloakAnim('player-human-f-idle', 'shadow', 'down')).toBe('cloak-shadow-idle-down');
  });

  it('maps mystic cloaks to arcane overlay', () => {
    expect(cloakVariantForItem('weave_cloak')).toBe('arcane');
    expect(cloakVariantForItem('silk_mantle')).toBe('arcane');
    expect(cloakVariantForItem('starweave_cloak')).toBe('arcane');
    expect(cloakVariantForItem('unknown_cloak')).toBe('traveler');
    expect(cloakVariantForItem(null)).toBeNull();
  });
});

describe('weapon overlay', () => {
  it('picks melee vs bow vs staff from save/stats', () => {
    expect(weaponOverlayForSave(false, false)).toBeNull();
    expect(weaponOverlayForSave(true, false)).toBe('melee');
    expect(weaponOverlayForSave(true, true)).toBe('bow');
    expect(weaponOverlayForSave(true, true, 'magic')).toBe('staff');
    expect(weaponOverlayForSave(true, true, 'bow')).toBe('bow');
  });

  it('maps player walk facing to weapon walk anim', () => {
    expect(playerAnimToWeaponAnim('player-human-walk-side', 'bow', 'side')).toBe('weapon-bow-walk-side');
    expect(playerAnimToWeaponAnim('player-elf-attack', 'melee', 'down')).toBe('weapon-melee-attack');
    expect(playerAnimToWeaponAnim('player-human-attack', 'staff', 'down')).toBe('weapon-staff-attack');
  });
});
