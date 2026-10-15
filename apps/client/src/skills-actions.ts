import {
  fetchSave,
  fetchSkillsForSave,
  updateSave,
  type PlayerSave,
  type SkillDefinition,
} from './api.js';
import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import type { HudController } from './hud-controller.js';
import {
  isSkillsOpen,
  renderSkillsPanel,
  SKILL_HOTBAR_SIZE,
  syncSkillCooldownsFromSave,
} from './skills-ui.js';

export interface SkillsActionsDeps {
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave) => void;
  getGame: () => Phaser.Game | null;
  getPlayerSkills: () => SkillDefinition[];
  setPlayerSkills: (skills: SkillDefinition[]) => void;
  getActiveSkillIds: () => (string | null)[];
  setActiveSkillIds: (ids: (string | null)[]) => void;
  hud: HudController;
  showToast: (text: string) => void;
}

export function createSkillsActions(deps: SkillsActionsDeps) {
  function hotbarFromSave(s: PlayerSave): (string | null)[] {
    const raw = s.skillHotbar;
    return Array.from({ length: SKILL_HOTBAR_SIZE }, (_, i) => raw?.[i] ?? null);
  }

  function syncActiveSkillIdsFromSave(): void {
    const save = deps.getSave();
    if (!save) {
      deps.setActiveSkillIds([]);
      return;
    }
    deps.setActiveSkillIds(hotbarFromSave(save));
  }

  async function refreshSkills(): Promise<void> {
    let save = deps.getSave();
    if (!save) return;
    const playerSkills = await fetchSkillsForSave(save.id);
    deps.setPlayerSkills(playerSkills);
    syncSkillCooldownsFromSave(playerSkills, save);
    if (save.skillHotbar === undefined) {
      try {
        save = await fetchSave(save.id);
        deps.setSave(save);
      } catch {
        /* keep */
      }
    }
    syncActiveSkillIdsFromSave();
    deps.hud.renderSkillsHud();
    const game = deps.getGame();
    if (game) {
      const scene = getGameScene(game);
      scene.setActiveSkillIds(deps.getActiveSkillIds());
      scene.setSkillDefinitions(playerSkills);
    }
    if (isSkillsOpen()) renderSkillsPanel();
  }

  async function handleSkillsChanged(unlocked?: string[]): Promise<void> {
    await refreshSkills();
    if (unlocked?.length) {
      deps.showToast(`Новый навык: ${unlocked.join(', ')}`);
    }
  }

  async function persistHotbar(slots: (string | null)[]): Promise<void> {
    const save = deps.getSave();
    if (!save) return;
    const next = await updateSave(save.id, { skillHotbar: slots });
    deps.setSave(next);
    syncActiveSkillIdsFromSave();
    deps.hud.renderSkillsHud();
    const game = deps.getGame();
    if (game) getGameScene(game).setActiveSkillIds(deps.getActiveSkillIds());
    deps.showToast('Панель навыков обновлена');
  }

  return {
    hotbarFromSave,
    syncActiveSkillIdsFromSave,
    refreshSkills,
    handleSkillsChanged,
    persistHotbar,
  };
}
