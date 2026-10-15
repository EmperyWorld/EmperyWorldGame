import { openShop } from './shop-ui.js';
import { openForge } from './forge-ui.js';
import { openHousingStorage } from './housing-ui.js';
import type { HousingStorageKind } from './api.js';

export function createNpcShopOpeners(ensureDismounted: () => Promise<boolean>) {
  return {
    openMerchantShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_merchant');
    },
    openArmorShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_armor');
    },
    openProvisionsShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_provisions');
    },
    openFishShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_fish');
    },
    openButcherShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_butcher');
    },
    openBakeryShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_bakery');
    },
    openBrewShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_brew');
    },
    openSuppliesShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_supplies');
    },
    openApothecaryShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_apothecary');
    },
    openRadioShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_radio', { buyOnly: true });
    },
    openStableShop: async () => {
      if (!await ensureDismounted()) return;
      await openShop('haven_stable', { buyOnly: true, mountsOnly: true });
    },
    openForge: async () => {
      if (!await ensureDismounted()) return;
      await openForge();
    },
    openHousingStorage: async (kind: HousingStorageKind) => {
      if (!await ensureDismounted()) return;
      await openHousingStorage(kind);
    },
  };
}
