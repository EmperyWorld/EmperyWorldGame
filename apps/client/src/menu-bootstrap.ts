import {
  createSave,
  fetchEnemies,
  fetchItems,
  fetchMediaManifest,
  fetchProfessions,
  fetchRaces,
  type EnemyDefinition,
  type ItemDefinition,
  type MediaManifest,
  type ProfessionDefinition,
  type Race,
} from './api.js';
import { ensureHudAtlas } from './hud-atlas.js';
import type { AuthMenuController } from './auth-menu-controller.js';
import type { createCreateMenu } from './create-menu.js';

export interface MenuBootstrapDeps {
  raceSelect: HTMLSelectElement;
  genderSelect: HTMLSelectElement;
  professionSelect: HTMLSelectElement;
  playerNameInput: HTMLInputElement;
  startBtn: HTMLButtonElement;
  createMenu: ReturnType<typeof createCreateMenu>;
  authMenu: AuthMenuController;
  getAccount: () => { id: string } | null;
  setRaces: (r: Race[]) => void;
  setProfessions: (p: ProfessionDefinition[]) => void;
  setEnemies: (e: EnemyDefinition[]) => void;
  setItems: (i: ItemDefinition[]) => void;
  setManifest: (m: MediaManifest) => void;
  setMenuBg: (assetId: string | undefined) => void;
  applyUiChrome: () => void;
  updateCreatePreview: () => void;
  startGameSession: (save: import('./api.js').PlayerSave) => Promise<void>;
  pollPortrait: (jobId: string) => Promise<void>;
  refreshSaveList: () => Promise<void>;
  showAuthPanel: (message?: string) => void;
}

export function createMenuBootstrap(deps: MenuBootstrapDeps) {
  async function initMenu(): Promise<void> {
    const [raceList, profList, enemyList, itemList, manifest] = await Promise.all([
      fetchRaces(),
      fetchProfessions(),
      fetchEnemies(),
      fetchItems(),
      fetchMediaManifest(),
    ]);
    deps.setRaces(raceList);
    deps.setProfessions(profList);
    deps.setEnemies(enemyList);
    deps.setItems(itemList);
    deps.setManifest(manifest);
    deps.applyUiChrome();
    await ensureHudAtlas(manifest);
    deps.createMenu.fillSelects(raceList, profList);
    deps.createMenu.bindPreviewListeners();
    deps.updateCreatePreview();
    deps.setMenuBg(
      manifest.assets.ui_menu_atmosphere ? 'ui_menu_atmosphere' : 'location_starter_grove',
    );
    await deps.authMenu.restoreSession();
  }

  function bindCreateButton(): void {
    deps.startBtn.addEventListener('click', async () => {
      if (!deps.getAccount()) {
        deps.showAuthPanel('Сначала войди в аккаунт');
        return;
      }
      const name = deps.playerNameInput.value.trim() || 'Странник';
      const race = deps.raceSelect.value;
      const gender = deps.genderSelect.value === 'female' ? 'female' : 'male';
      const profession = deps.professionSelect.value;
      deps.startBtn.disabled = true;
      try {
        const created = await createSave(name, race, profession, gender);
        if (created.portraitJobId) void deps.pollPortrait(created.portraitJobId);
        await deps.startGameSession(created);
        void deps.refreshSaveList();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Не удалось создать персонажа');
        deps.startBtn.disabled = false;
      }
    });
  }

  return { initMenu, bindCreateButton };
}
