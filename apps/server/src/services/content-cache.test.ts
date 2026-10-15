import { describe, expect, it } from 'vitest';
import { clearLocationsCache, getLocation, loadLocations } from './locations.js';
import { clearEnemiesCache, getEnemy, loadEnemies } from './enemies.js';
import { clearSkillsCache, getSkill, loadSkills } from './skills.js';
import {
  clearTownServicesCache,
  getCraftRecipe,
  loadCraftRecipes,
  resolveShopId,
} from './town-services.js';
import {
  clearProfessionsCache,
  getProfession,
  loadProfessions,
} from './professions.js';

describe('YAML content caches', () => {
  it('returns the same location objects across getLocation / loadLocations', () => {
    clearLocationsCache();
    const first = getLocation('empery_haven');
    expect(first).toBeTruthy();
    expect(getLocation('empery_haven')).toBe(first);
    expect(loadLocations()).toBe(loadLocations());
  });

  it('indexes enemies and skills by id without re-reading YAML', () => {
    clearEnemiesCache();
    clearSkillsCache();
    const enemy = getEnemy('goblin_scout');
    const skill = getSkill('leather_craft');
    expect(enemy).toBeTruthy();
    expect(getEnemy(enemy!.id)).toBe(enemy);
    expect(loadEnemies()).toBe(loadEnemies());
    expect(skill).toBeTruthy();
    expect(getSkill('backstab')?.tactic).toBe('backstab');
    expect(getSkill('execute')?.tactic).toBe('execute');
    expect(getSkill('cleave')?.tactic).toBe('cleave');
    expect(getSkill('flame_burst')?.tactic).toBe('cleave');
    expect(getSkill('poison_blade')?.tactic).toBe('poison');
    expect(getSkill('marking_shot')?.tactic).toBe('mark');
    expect(getSkill('rain_of_arrows')?.tactic).toBe('cleave');
    expect(getSkill('ballista_bolt')?.tactic).toBe('snipe');
    expect(getSkill('vanishing_strike')?.tactic).toBe('vanish');
    expect(getSkill('serpentine_arrow')?.tactic).toBe('seek');
    expect(getSkill('shadow_strike')?.tactic).toBe('seek');
    expect(getSkill('shield_bash')?.control).toBe('stun');
    expect(getSkill('pin_down')?.control).toBe('pin');
    expect(getSkill('ice_lance')?.control).toBe('pin');
    expect(getSkill('frost_nova')?.tactic).toBe('cleave');
    expect(getSkill('frost_nova')?.control).toBe('pin');
    expect(getSkill('war_cry')?.tactic).toBe('cleave');
    expect(getSkill('cataclysm')?.tactic).toBe('cleave');
    expect(getSkill('worldbreaker')?.tactic).toBe('cleave');
    expect(getSkill('storm_call')?.tactic).toBe('cleave');
    expect(getSkill('black_sun')?.tactic).toBe('cleave');
    expect(getSkill('abyss_flare')?.tactic).toBe('cleave');
    expect(getSkill('pyre_burst')?.tactic).toBe('cleave');
    expect(getSkill('pyre_burst')?.rangeBias).toBe('close');
    expect(getSkill('obliterate')?.tactic).toBe('execute');
    expect(getSkill('final_whisper')?.tactic).toBe('execute');
    expect(getSkill('void_needle')?.tactic).toBe('seek');
    expect(getSkill('singularity')?.tactic).toBe('seek');
    expect(getSkill('comet_fall')?.tactic).toBe('snipe');
    expect(getSkill(skill!.id)).toBe(skill);
    expect(loadSkills()).toBe(loadSkills());
  });

  it('caches city shops, craft recipes, and professions', () => {
    clearTownServicesCache();
    clearProfessionsCache();

    const recipes = loadCraftRecipes();
    const professions = loadProfessions();
    expect(loadCraftRecipes()).toBe(recipes);
    expect(getCraftRecipe(recipes[0]!.id)).toBe(recipes[0]);
    expect(loadProfessions()).toBe(professions);
    expect(getProfession(professions[0]!.id)).toBe(professions[0]);
    expect(resolveShopId('haven_merchant')).toBe('haven_merchant');
    expect(resolveShopId('missing_shop')).toBe('haven_merchant');
  });
});
