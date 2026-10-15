import {
  fetchLocation,
  fetchSave,
  fetchSurvival,
  type PlayerSave,
  type PlayerStats,
  type Race,
} from './api.js';
import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import type { LocationConfig as GameLocationConfig } from './game/scenes/location-types.js';
import type { LocationDefinition } from './api.js';
import { ensureMountCatalog } from './mount-catalog.js';
import type { HudController } from './hud-controller.js';
import { clearChatLog } from './chat-ui.js';
import { clearPartyUi, setPartySelf, setPartySelected } from './party-ui.js';
import { setTargetUi } from './target-ui.js';
import { dismissRadioCall } from './radio-call-ui.js';
import { syncDeathScreen } from './death-ui.js';

export interface SessionLifecycleDeps {
  menu: HTMLElement;
  gameplayShell: HTMLElement;
  chatPanelEl: HTMLElement;
  deathScreen: HTMLElement;
  startBtn: HTMLButtonElement;
  continueBtn: HTMLButtonElement;
  hud: HudController;
  getSave: () => PlayerSave | null;
  setSave: (s: PlayerSave | null) => void;
  getStats: () => PlayerStats | null;
  setStats: (s: PlayerStats | null) => void;
  getLocation: () => GameLocationConfig | null;
  setLocation: (loc: GameLocationConfig | null) => void;
  getGame: () => Phaser.Game | null;
  setGame: (g: Phaser.Game | null) => void;
  getRaces: () => Race[];
  getActiveSkillIds: () => (string | null)[];
  getPlayerSkills: () => import('./api.js').SkillDefinition[];
  getAccount: () => { id: string } | null;
  toGameLocation: (loc: LocationDefinition) => GameLocationConfig;
  updateHud: (save: PlayerSave, stats?: PlayerStats) => void;
  showToast: (text: string) => void;
  syncUiBlocked: () => void;
  rememberSave: (id: string) => void;
  setPortraitUrl: (url: string | undefined, target: 'menu' | 'hud' | 'both') => void;
  racePortraitUrl: (
    raceId: string,
    gender: 'male' | 'female' | undefined,
    portraitAsset: string | undefined,
    profession: string,
  ) => string | undefined;
  refreshSkills: () => Promise<void>;
  ensureGame: () => Promise<void>;
  transitionLocation: () => void;
  ensureMediaManifest: () => Promise<void>;
  closeOverlaysExtra: () => void;
  showSelectPanel: () => void;
  restoreSession: () => Promise<void>;
}

export function createSessionLifecycle(deps: SessionLifecycleDeps) {
  function closeOverlays(): void {
    deps.closeOverlaysExtra();
    dismissRadioCall();
  }

  function returnToMenu(): void {
    closeOverlays();
    deps.chatPanelEl.classList.add('hidden');
    clearChatLog();
    clearPartyUi();
    deps.hud.clearBuffs();
    setTargetUi(null, {
      canInvite: false,
      canWhisper: false,
      canResurrect: false,
      canPromote: false,
      canAssist: false,
      assistActive: false,
    });
    setPartySelected(null);
    deps.hud.stopSkillCdTicker();
    deps.hud.stopMpRegenTicker();
    deps.getGame()?.destroy(true);
    deps.setGame(null);
    deps.setSave(null);
    deps.setStats(null);
    deps.setLocation(null);
    deps.menu.classList.remove('hidden');
    deps.gameplayShell.classList.add('hidden');
    document.documentElement.classList.remove('in-game');
    deps.startBtn.disabled = false;
    deps.continueBtn.disabled = false;
    if (deps.getAccount()) deps.showSelectPanel();
    else void deps.restoreSession();
  }

  async function startGameSession(loaded: PlayerSave): Promise<void> {
    let survivalLoaded = loaded;
    await Promise.all([
      ensureMountCatalog().catch(() => undefined),
      deps.ensureMediaManifest().catch(() => undefined),
    ]);
    const survival = await fetchSurvival(loaded.id);
    survivalLoaded = survival.save;
    const stats = survival.stats;
    deps.setSave(survivalLoaded);
    deps.setStats(stats);
    const loc = await fetchLocation(survivalLoaded.location);
    deps.setLocation(deps.toGameLocation(loc));

    deps.rememberSave(survivalLoaded.id);
    deps.hud.clearBuffs();
    deps.updateHud(survivalLoaded, stats);
    closeOverlays();
    deps.menu.classList.add('hidden');
    deps.gameplayShell.classList.remove('hidden');
    document.documentElement.classList.add('in-game');
    deps.chatPanelEl.classList.remove('hidden');
    setPartySelf(survivalLoaded.id);

    const raceDef = deps.getRaces().find((r) => r.id === survivalLoaded.race);
    deps.setPortraitUrl(
      deps.racePortraitUrl(survivalLoaded.race, survivalLoaded.gender, raceDef?.portraitAsset, survivalLoaded.profession),
      'hud',
    );

    await deps.refreshSkills();
    const game = deps.getGame();
    if (game) {
      deps.transitionLocation();
    } else {
      await deps.ensureGame();
      const g = deps.getGame();
      if (g) {
        try {
          const scene = getGameScene(g);
          scene.setActiveSkillIds(deps.getActiveSkillIds());
          scene.setSkillDefinitions(deps.getPlayerSkills());
        } catch {
          /* scene may still be booting */
        }
      }
    }
    if (survivalLoaded.hp <= 0) {
      deps.deathScreen.classList.add('visible');
      syncDeathScreen(
        survivalLoaded.lastDeathCause?.trim() ||
          'Персонаж пал (в т.ч. пока вы были вне игры).',
        survivalLoaded.lastDeathKind,
      );
      deps.showToast(survivalLoaded.lastDeathCause?.trim() || 'Персонаж мёртв — нужен респаун');
    }
    deps.syncUiBlocked();
  }

  async function loadSave(saveId: string): Promise<void> {
    deps.startBtn.disabled = true;
    deps.continueBtn.disabled = true;
    try {
      const loaded = await fetchSave(saveId);
      await startGameSession(loaded);
      deps.rememberSave(saveId);
    } catch (err) {
      console.error(err);
      alert('Не удалось загрузить сохранение');
      deps.startBtn.disabled = false;
      deps.continueBtn.disabled = false;
    }
  }

  return { closeOverlays, returnToMenu, startGameSession, loadSave };
}
