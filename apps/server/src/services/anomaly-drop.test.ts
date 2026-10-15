import { describe, expect, it } from 'vitest';
import { loadItems, getItem } from './items.js';
import { listShopOffers } from './town-services.js';
import { loadEnemies } from './enemies.js';

describe('anomaly drop-only gear', () => {
  const dropItems = loadItems().filter((i) =>
    [
      'rift_cleaver',
      'singularity_edge',
      'worldscar_blade',
      'era_skybow',
      'bastion_of_eras',
      'mantle_beyond',
    ].includes(i.id),
  );

  it('loads anomaly_drop items', () => {
    expect(getItem('rift_cleaver')?.rarity).toBe('rare');
    expect(getItem('era_skybow')?.weaponKind).toBe('bow');
    expect(getItem('bastion_of_eras')?.slot).toBe('shield');
    expect(dropItems.length).toBeGreaterThanOrEqual(6);
  });

  it('is not sold in haven_merchant', () => {
    const shopIds = new Set(listShopOffers('haven_merchant').map((o) => o.item.id));
    const anomaly = loadItems().filter((i) =>
      [
        'rift_cleaver',
        'fold_stiletto',
        'voidscar_greatsword',
        'singularity_edge',
        'worldscar_blade',
        'whisper_of_nix',
        'era_skybow',
        'crown_of_collapse',
        'mail_of_the_rift',
        'quiver_of_godfall',
      ].includes(i.id),
    );
    expect(anomaly.length).toBeGreaterThanOrEqual(10);
    for (const item of anomaly) {
      expect(shopIds.has(item.id), item.id).toBe(false);
    }
  });

  it('high-level enemies drop at least one anomaly item', () => {
    const enemies = loadEnemies().filter((e) => e.level >= 40);
    expect(enemies.length).toBeGreaterThan(0);
    const anomalyIds = new Set(
      loadItems()
        .filter((i) =>
          [
            'rift_cleaver',
            'collapse_longbow',
            'singularity_edge',
            'worldscar_blade',
            'pantheon_arc',
            'godfall_cloak',
          ].includes(i.id),
        )
        .map((i) => i.id),
    );
    // broaden: any item from anomaly file by checking a known unique id appears in some drop table
    let hits = 0;
    for (const e of enemies) {
      for (const d of e.drops ?? []) {
        if (d.item && anomalyIds.has(d.item)) hits += 1;
      }
    }
    expect(hits).toBeGreaterThan(0);
  });
});
