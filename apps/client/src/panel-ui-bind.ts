import {
  equipItem,
  fetchEquipPreview,
  fetchStats,
  consumeSurvivalItem,
  processSurvival,
  resurrectAlly,
  treatSurvival,
  unequipItem,
  type ItemDefinition,
  type PlayerSave,
  type PlayerStats,
  type Race,
  type SkillDefinition,
} from './api.js';
import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import type { DialogueController } from './dialogue-controller.js';
import {
  mountInventory,
  renderInventory,
  isInventoryOpen,
  invalidateInventoryPreview,
} from './inventory-ui.js';
import { mountTravel } from './travel-ui.js';
import { mountShop } from './shop-ui.js';
import { mountForge } from './forge-ui.js';
import { mountHousingStorage } from './housing-ui.js';
import { mountStationPanel } from './station-ui.js';
import { mountRadio } from './radio-ui.js';
import { mountRadioCall, dismissRadioCall } from './radio-call-ui.js';
import { mountSkills, SKILL_HOTBAR_SIZE } from './skills-ui.js';
import { mountSettings } from './settings-ui.js';

export interface PanelUiBindDeps {
  inventoryEl: HTMLElement;
  travelEl: HTMLElement;
  shopEl: HTMLElement;
  forgeEl: HTMLElement;
  housingEl: HTMLElement;
  stationEl: HTMLElement;
  radioEl: HTMLElement;
  radioCallEl: HTMLElement;
  skillsEl: HTMLElement;
  settingsEl: HTMLElement;
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave) => void;
  getStats: () => PlayerStats | null;
  setStats: (s: PlayerStats) => void;
  getItems: () => ItemDefinition[];
  getRaces: () => Race[];
  getGame: () => Phaser.Game | null;
  getPlayerSkills: () => SkillDefinition[];
  assetUrl: (assetId: string) => string | undefined;
  racePortraitUrl: (
    raceId: string,
    gender: 'male' | 'female' | undefined,
    portraitAsset: string | undefined,
    profession: string,
  ) => string | undefined;
  raceLabel: (raceId: string) => string;
  updateHud: (save: PlayerSave, stats?: PlayerStats) => void;
  showToast: (text: string) => void;
  syncUiBlocked: () => void;
  doTravel: (locationId: string) => Promise<void>;
  hotbarFromSave: (s: PlayerSave) => (string | null)[];
  persistHotbar: (slots: (string | null)[]) => Promise<void>;
  dialogue: DialogueController;
}

export function bindPanelUi(deps: PanelUiBindDeps): void {
  const refreshInvIfOpen = (): void => {
    if (isInventoryOpen()) void renderInventory();
  };

  mountInventory(deps.inventoryEl, {
    getSave: deps.getSave,
    getStats: deps.getStats,
    getItems: deps.getItems,
    assetUrl: deps.assetUrl,
    getPortraitUrl: () => {
      const save = deps.getSave();
      if (!save) return undefined;
      const race = deps.getRaces().find((r) => r.id === save.race);
      return deps.racePortraitUrl(save.race, save.gender, race?.portraitAsset, save.profession);
    },
    fetchPreview: async (itemId) => {
      const save = deps.getSave();
      if (!save) return null;
      try {
        return await fetchEquipPreview(save.id, itemId);
      } catch {
        return null;
      }
    },
    onEquip: async (itemId, targetSlot) => {
      const save = deps.getSave();
      if (!save) return;
      const item = deps.getItems().find((i) => i.id === itemId);
      const result = await equipItem(save.id, itemId, targetSlot);
      deps.setSave(result.save);
      deps.setStats(result.stats);
      invalidateInventoryPreview();
      deps.updateHud(result.save, result.stats);
      deps.showToast(`${item?.name ?? 'Предмет'} экипирован`);
      refreshInvIfOpen();
    },
    onUnequip: async (slot) => {
      const save = deps.getSave();
      if (!save) return;
      const itemId = save.equipment[slot];
      const item = itemId ? deps.getItems().find((i) => i.id === itemId) : undefined;
      const result = await unequipItem(save.id, slot);
      deps.setSave(result.save);
      deps.setStats(result.stats);
      invalidateInventoryPreview();
      deps.updateHud(result.save, result.stats);
      deps.showToast(`${item?.name ?? 'Предмет'} снят`);
      refreshInvIfOpen();
    },
    onUseConsumable: async (itemId) => {
      const save = deps.getSave();
      const game = deps.getGame();
      if (!save || !game) return;
      if (itemId !== 'resurrection_scroll') {
        try {
          const item = deps.getItems().find((candidate) => candidate.id === itemId);
          const result =
            item?.survival?.tool === 'bandage' ||
            item?.survival?.tool === 'antibiotic' ||
            item?.survival?.tool === 'antipyretic'
              ? await treatSurvival(save.id, itemId)
              : await consumeSurvivalItem(save.id, itemId);
          deps.setSave(result.save);
          deps.setStats(result.stats);
          deps.updateHud(result.save, result.stats);
          deps.showToast(result.message);
          refreshInvIfOpen();
        } catch (err) {
          deps.showToast(err instanceof Error ? err.message : 'Не удалось использовать предмет');
        }
        return;
      }
      if (save.hp <= 0) {
        deps.showToast('Свиток только живым — на павшего рядом');
        return;
      }
      try {
        const scene = getGameScene(game);
        const nearest = scene.nearestDeadPlayer(72);
        if (!nearest) {
          deps.showToast('Рядом нет павших героев');
          return;
        }
        const result = await resurrectAlly(save.id, nearest.saveId);
        deps.setSave(result.save);
        deps.setStats(result.stats);
        deps.updateHud(result.save, result.stats);
        deps.showToast(result.message);
        refreshInvIfOpen();
      } catch (err) {
        deps.showToast(err instanceof Error ? err.message : 'Не удалось воскресить');
      }
    },
    onSurvivalProcess: async (recipeId) => {
      const save = deps.getSave();
      if (!save) return;
      try {
        const result = await processSurvival(save.id, recipeId);
        deps.setSave(result.save);
        deps.setStats(result.stats);
        deps.updateHud(result.save, result.stats);
        deps.showToast(result.message);
        refreshInvIfOpen();
      } catch (err) {
        deps.showToast(err instanceof Error ? err.message : 'Не удалось обработать ресурс');
      }
    },
    onClose: () => deps.syncUiBlocked(),
  });

  mountTravel(deps.travelEl, {
    getSave: deps.getSave,
    assetUrl: deps.assetUrl,
    raceLabel: deps.raceLabel,
    onTravel: async (locationId) => {
      await deps.doTravel(locationId);
    },
  });

  mountShop(deps.shopEl, {
    getSave: deps.getSave,
    assetUrl: deps.assetUrl,
    onSaveUpdate: (next) => {
      deps.setSave(next);
      void fetchStats(next.id).then((s) => {
        deps.setStats(s);
        deps.updateHud(next, s);
      });
      deps.updateHud(next, deps.getStats() ?? undefined);
      refreshInvIfOpen();
    },
    onToast: deps.showToast,
    onClose: () => deps.syncUiBlocked(),
  });

  mountForge(deps.forgeEl, {
    getSave: deps.getSave,
    assetUrl: deps.assetUrl,
    onSaveUpdate: (next, stats) => {
      deps.setSave(next);
      if (stats) deps.setStats(stats);
      else {
        void fetchStats(next.id).then((s) => {
          deps.setStats(s);
          deps.updateHud(next, s);
        });
      }
      deps.updateHud(next, stats ?? deps.getStats() ?? undefined);
      refreshInvIfOpen();
    },
    onToast: deps.showToast,
    onClose: () => deps.syncUiBlocked(),
  });

  mountHousingStorage(deps.housingEl, {
    getSave: deps.getSave,
    getItems: deps.getItems,
    assetUrl: deps.assetUrl,
    onSaveUpdate: (next, stats) => {
      deps.setSave(next);
      if (stats) deps.setStats(stats);
      else {
        void fetchStats(next.id).then((s) => {
          deps.setStats(s);
          deps.updateHud(next, s);
        });
      }
      deps.updateHud(next, stats ?? deps.getStats() ?? undefined);
      refreshInvIfOpen();
    },
    onToast: deps.showToast,
    onClose: () => deps.syncUiBlocked(),
  });

  mountStationPanel(deps.stationEl, {
    getSave: deps.getSave,
    onSaveUpdate: (next, stats) => {
      deps.setSave(next);
      if (stats) deps.setStats(stats);
      else {
        void fetchStats(next.id).then((s) => {
          deps.setStats(s);
          deps.updateHud(next, s);
        });
      }
      deps.updateHud(next, stats ?? deps.getStats() ?? undefined);
      refreshInvIfOpen();
    },
    onToast: deps.showToast,
    onClose: () => deps.syncUiBlocked(),
  });

  mountRadio(deps.radioEl, {
    getSave: deps.getSave,
    onSaveUpdate: (next) => {
      deps.setSave(next);
      deps.updateHud(next, deps.getStats() ?? undefined);
      refreshInvIfOpen();
    },
    onToast: deps.showToast,
    onCallNpc: (npcId) => {
      dismissRadioCall();
      void deps.dialogue.show(npcId, 'radio').then(() => deps.syncUiBlocked());
    },
    onClose: () => deps.syncUiBlocked(),
  });

  mountRadioCall(deps.radioCallEl, {
    assetUrl: deps.assetUrl,
    onToast: deps.showToast,
    onAnswer: (npcId) => {
      deps.radioEl.classList.remove('visible');
      if (deps.dialogue.isOpen()) deps.dialogue.close();
      void deps.dialogue.show(npcId, 'radio').then(() => deps.syncUiBlocked());
    },
  });

  mountSkills(deps.skillsEl, {
    getSave: deps.getSave,
    getSkills: deps.getPlayerSkills,
    getHotbar: () => {
      const save = deps.getSave();
      return save ? deps.hotbarFromSave(save) : Array.from({ length: SKILL_HOTBAR_SIZE }, () => null);
    },
    assetUrl: deps.assetUrl,
    onHotbarChange: (slots) => deps.persistHotbar(slots),
    onClose: () => deps.syncUiBlocked(),
  });

  mountSettings(deps.settingsEl, {
    onClose: () => deps.syncUiBlocked(),
    onToast: deps.showToast,
  });
}
