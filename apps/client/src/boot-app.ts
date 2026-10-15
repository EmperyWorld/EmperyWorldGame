import { submitBugReport, type ClientBugReportPayload, type LocationDefinition } from './api.js';
import { DialogueController } from './dialogue-controller.js';
import { AuthMenuController } from './auth-menu-controller.js';
import { OverlayController } from './overlay-controller.js';
import { GameSession } from './game-session.js';
import { HudController } from './hud-controller.js';
import { createMountActions } from './mount-actions.js';
import { createPartyTargetSync } from './party-target-sync.js';
import { createGameCallbacks } from './game-callbacks.js';
import { createToastUi } from './toast-ui.js';
import { createTravelActions } from './travel-actions.js';
import { createSessionLifecycle } from './session-lifecycle.js';
import { createSkillsActions } from './skills-actions.js';
import { createRespawnActions } from './respawn-actions.js';
import { createMediaHelpers } from './media-helpers.js';
import { toGameLocation as mapLocationDef } from './location-map.js';
import { createMenuBootstrap } from './menu-bootstrap.js';
import { createUiBridge } from './ui-bridge.js';
import { createAppUiSlot } from './app-ui-slot.js';
import { bindSocialUi } from './social-ui-bind.js';
import { bindPanelUi } from './panel-ui-bind.js';
import { createCreateMenu } from './create-menu.js';
import { createNpcShopOpeners } from './npc-shops.js';
import { openStationPanel } from './station-ui.js';
import { dom } from './app-dom.js';
import { createAppState } from './app-state.js';
import { getGameScene } from './game/game-loader.js';
import { applyUiAudioPrefs, bindUiAudioUnlock } from './ui-audio.js';
import { applyGraphicsDocument, getGraphicsQuality } from './game/systems/graphics-quality.js';
import { getClientSettings } from './settings-store.js';
import { getHavenSchedule, getWorldGameHour } from './world-clock.js';

/** Wire controllers, panels, and menu — call once from the client entry. */
export function bootApp(): void {
  applyGraphicsDocument();
  applyUiAudioPrefs();
  bindUiAudioUnlock();
  const state = createAppState();
  const { showToast } = createToastUi(dom.toastEl);

  const media = createMediaHelpers({
    getManifest: state.getManifest,
    setManifest: state.setManifest,
    menuPortraitEl: dom.menuPortraitEl,
    hudPortraitEl: dom.hudPortraitEl,
    menuBg: dom.menuBg,
  });
  const {
    assetUrl,
    ensureMediaManifest,
    rememberSave,
    setPortraitUrl,
    setMenuBg,
    applyUiChrome,
    racePortraitUrl,
    pollPortrait,
  } = media;

  function toGameLocation(loc: LocationDefinition) {
    return mapLocationDef(loc, assetUrl);
  }

  const { ui, bindUi } = createAppUiSlot();
  const { updateHud, syncUiBlocked, showDialogue } = ui;

  let skillsActions: ReturnType<typeof createSkillsActions>;

  const hud = new HudController({
    getSave: state.getSave,
    setSave: state.setSave,
    getStats: state.getStats,
    setStats: state.setStats,
    getSkills: state.getPlayerSkills,
    getActiveSkillIds: state.getActiveSkillIds,
    syncActiveSkillIdsFromSave: () => skillsActions.syncActiveSkillIdsFromSave(),
    getLocation: state.getLocation,
    getGame: state.getGame,
    isGameplayVisible: () => !dom.gameplayShell.classList.contains('hidden'),
    professionLabel: state.professionLabel,
    assetUrl,
    showToast,
  });

  skillsActions = createSkillsActions({
    getSave: state.getSave,
    setSave: state.patchSave,
    getGame: state.getGame,
    getPlayerSkills: state.getPlayerSkills,
    setPlayerSkills: state.setPlayerSkills,
    getActiveSkillIds: state.getActiveSkillIds,
    setActiveSkillIds: state.setActiveSkillIds,
    hud,
    showToast,
  });
  const { refreshSkills, handleSkillsChanged, hotbarFromSave, persistHotbar } = skillsActions;

  const mountActions = createMountActions({
    getSave: state.getSave,
    setSave: state.patchSave,
    getStats: state.getStats,
    setStats: state.patchStats,
    getGame: state.getGame,
    getLocation: state.getLocation,
    updateHud: (s, st) => updateHud(s, st ?? undefined),
    showToast,
  });
  const { handleToggleMount, ensureDismounted, syncMountButton } = mountActions;

  const partyTargetSync = createPartyTargetSync({
    getSave: state.getSave,
    setSave: state.patchSave,
    getStats: state.getStats,
    setStats: state.patchStats,
    getGame: state.getGame,
    updateHud: (s, st) => updateHud(s, st ?? undefined),
    showToast,
  });
  const { resurrectTarget, syncPartyRegistry, syncPartyXpFromScene, refreshTargetActions } =
    partyTargetSync;

  const createMenu = createCreateMenu({
    raceSelect: dom.raceSelect,
    genderSelect: dom.genderSelect,
    professionSelect: dom.professionSelect,
    createPreviewMetaEl: dom.createPreviewMetaEl,
    createBranchHintEl: dom.createBranchHintEl,
    getRaces: state.getRaces,
    professionLabel: state.professionLabel,
    racePortraitUrl,
    setPortraitUrl,
  });
  const { updateCreatePreview } = createMenu;

  const gameSession = new GameSession({
    getSave: state.getSave,
    getStats: state.getStats,
    getLocation: state.getLocation,
    getEnemies: state.getEnemies,
    getActiveSkillIds: state.getActiveSkillIds,
    getSkillDefinitions: state.getPlayerSkills,
    getItems: state.getItems,
    getMediaManifest: state.getManifest,
    refreshMediaManifest: ensureMediaManifest,
    getGame: state.getGame,
    setGame: state.setGame,
    getGameCallbacks,
  });

  const respawnActions = createRespawnActions({
    getSave: state.getSave,
    setSave: state.patchSave,
    getStats: state.getStats,
    setStats: state.patchStats,
    getGame: state.getGame,
    getLocation: state.getLocation,
    setLocation: state.patchLocation,
    toGameLocation,
    // Lazy: ui-bridge assigns these after dialogue/overlays exist.
    updateHud: (s, st) => updateHud(s, st),
    showToast,
    syncUiBlocked: () => syncUiBlocked(),
    deathScreen: dom.deathScreen,
    transitionLocation: () => gameSession.transitionLocation(),
  });
  const { handleRespawn, applyAllyResurrection } = respawnActions;

  const dialogue = new DialogueController({
    getSave: state.getSave,
    setSave: state.patchSave,
    getStats: state.getStats,
    setStats: state.patchStats,
    updateHud: (s, st) => updateHud(s, st),
    assetUrl,
    showToast,
    syncUiBlocked: () => syncUiBlocked(),
    ...createNpcShopOpeners(ensureDismounted),
    enterApartmentLocation: async (location, save, stats) => {
      state.patchSave(save);
      state.patchStats(stats);
      state.patchLocation(toGameLocation(location));
      updateHud(save, stats);
      gameSession.transitionLocation();
      syncUiBlocked();
    },
    getLocationId: () => state.getLocation()?.id,
    setNavigationTarget: (target) => {
      const game = state.getGame();
      if (!game) return false;
      try {
        const gs = getGameScene(game);
        return Boolean(gs?.scene.isActive() && gs.setNavigationTarget(target));
      } catch {
        return false;
      }
    },
    getCitizenPortrait: (npcId)=>{
      const game=state.getGame();if(!game)return null;
      const scene=getGameScene(game);
      const getPortrait=scene?.registry.get('getTalkingCitizenPortrait') as ((id:string)=>string|null)|undefined;
      return getPortrait?.(npcId)??null;
    },
    setTalkingNpc: (npcId) => {
      const g = state.getGame();
      if (!g) return;
      try {
        const gs = getGameScene(g);
        if (gs && gs.scene.isActive()) {
          gs.entities.setTalkingNpc(npcId);
          const setCit = gs.registry.get('setTalkingCitizen') as ((id: string | null) => void) | undefined;
          setCit?.(npcId);
        }
      } catch {
        /* scene not ready */
      }
    },
  });

  const authMenu = new AuthMenuController({
    getAccount: state.getAccount,
    setAccount: state.setAccount,
    getSaveSlots: state.getSaveSlots,
    setSaveSlots: state.setSaveSlots,
    getSave: state.getSave,
    setSave: state.setSave,
    setStats: state.setStats,
    raceLabel: state.raceLabel,
    professionLabel: state.professionLabel,
    loadSave: (id) => sessionLife.loadSave(id),
    showToast,
    onShowCreatePanel: () => {
      dom.startBtn.disabled = false;
      updateCreatePreview();
    },
  });

  let sessionLife: ReturnType<typeof createSessionLifecycle>;

  const collectNpcLifeEvents = (): unknown[] => {
    try {
      const root = globalThis as typeof globalThis & { __EW_NPC_LIFE_EVENTS?: unknown[] };
      const events = Array.isArray(root.__EW_NPC_LIFE_EVENTS) ? root.__EW_NPC_LIFE_EVENTS : [];
      return events.slice(-120);
    } catch {
      return [];
    }
  };

  const reportBugFromHud = async (): Promise<void> => {
    const save = state.getSave();
    const location = state.getLocation();
    const targetName =
      document.getElementById('hud-target-name')?.textContent?.trim() ||
      document.querySelector('#dialogue-npc-name')?.textContent?.trim() ||
      null;
    const uiFocus =
      document.activeElement instanceof HTMLElement
        ? {
            tag: document.activeElement.tagName,
            id: document.activeElement.id || null,
            className: document.activeElement.className || null,
          }
        : null;
    const payload: ClientBugReportPayload = {
      source: 'hud_bug_button',
      now: Date.now(),
      url: typeof window === 'undefined' ? 'n/a' : window.location.href,
      userAgent: typeof navigator === 'undefined' ? 'n/a' : navigator.userAgent,
      saveId: save?.id ?? null,
      locationId: location?.id ?? null,
      worldTime: {
        hour: getWorldGameHour() ?? null,
      },
      havenSchedule: getHavenSchedule(),
      settings: getClientSettings(),
      graphicsQuality: getGraphicsQuality(),
      npcLifeEvents: collectNpcLifeEvents(),
      note:
        targetName != null
          ? `focus=${targetName}; uiFocus=${JSON.stringify(uiFocus)}`
          : `uiFocus=${JSON.stringify(uiFocus)}`,
    };
    try {
      const result = await submitBugReport(payload);
      showToast(`Bug report отправлен: ${result.reportId}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось отправить bug report');
    }
  };

  const overlays = new OverlayController({
    getGame: state.getGame,
    getSave: state.getSave,
    isMenuHidden: () => dom.menu.classList.contains('hidden'),
    isDialogueOpen: () => dialogue.isOpen(),
    closeDialogue: () => dialogue.close(),
    refreshSkills,
    returnToMenu: () => sessionLife.returnToMenu(),
    toggleAutoAttack: () => hud.toggleAutoAttackFromUi(),
    toggleMount: () => void handleToggleMount(),
    ensureDismounted: () => ensureDismounted(),
    handleRespawn: () => handleRespawn(),
    reportBug: reportBugFromHud,
    showToast,
    closeSurvivalPanel: () => hud.closeSurvivalPanel(),
  });

  bindUi(
    createUiBridge({
      hud,
      overlays,
      dialogue,
      syncMountButton,
      ensureDismounted,
    }),
  );

  const { doTravel } = createTravelActions({
    getSave: state.getSave,
    setSave: state.patchSave,
    setStats: state.patchStats,
    getLocation: state.getLocation,
    setLocation: state.patchLocation,
    toGameLocation,
    updateHud,
    showToast,
    transitionLocation: () => gameSession.transitionLocation(),
    syncUiBlocked,
    travelEl: dom.travelEl,
    notifyRealtimeTravel: (locationId) => {
      const game = state.getGame();
      if (!game) return;
      try {
        const scene = getGameScene(game);
        // Hint for reconnect only — do NOT join_location while the old
        // scene still has the body at apartment/market coords (~640).
        // Early join + player_input was overwriting door arrival on Haven.
        scene.realtime.setLocation(locationId);
        scene.realtime.freezePlayerInput();
      } catch {
        /* scene may be mid-swap */
      }
    },
    onTravelResult: (ok) => {
      const game = state.getGame();
      if (!game) return;
      try {
        getGameScene(game).notifyTravelResult(ok);
      } catch {
        /* scene may be swapping */
      }
    },
  });

  sessionLife = createSessionLifecycle({
    menu: dom.menu,
    gameplayShell: dom.gameplayShell,
    chatPanelEl: dom.chatPanelEl,
    deathScreen: dom.deathScreen,
    startBtn: dom.startBtn,
    continueBtn: dom.continueBtn,
    hud,
    getSave: state.getSave,
    setSave: state.setSave,
    getStats: state.getStats,
    setStats: state.setStats,
    getLocation: state.getLocation,
    setLocation: state.setLocation,
    getGame: state.getGame,
    setGame: state.setGame,
    getRaces: state.getRaces,
    getActiveSkillIds: state.getActiveSkillIds,
    getPlayerSkills: state.getPlayerSkills,
    getAccount: state.getAccount,
    toGameLocation,
    updateHud,
    showToast,
    syncUiBlocked,
    rememberSave,
    setPortraitUrl,
    racePortraitUrl,
    refreshSkills,
    ensureGame: () => gameSession.ensureGame(),
    transitionLocation: () => gameSession.transitionLocation(),
    ensureMediaManifest,
    closeOverlaysExtra: () => overlays.closeAll(),
    showSelectPanel: () => authMenu.showSelectPanel(),
    restoreSession: () => authMenu.restoreSession(),
  });
  const { startGameSession } = sessionLife;

  bindPanelUi({
    inventoryEl: dom.inventoryEl,
    travelEl: dom.travelEl,
    shopEl: dom.shopEl,
    forgeEl: dom.forgeEl,
    housingEl: dom.housingEl,
    stationEl: dom.stationEl,
    radioEl: dom.radioEl,
    radioCallEl: dom.radioCallEl,
    skillsEl: dom.skillsEl,
    settingsEl: dom.settingsEl,
    getSave: state.getSave,
    setSave: state.patchSave,
    getStats: state.getStats,
    setStats: state.patchStats,
    getItems: state.getItems,
    getRaces: state.getRaces,
    getGame: state.getGame,
    getPlayerSkills: state.getPlayerSkills,
    assetUrl,
    racePortraitUrl,
    raceLabel: state.raceLabel,
    updateHud,
    showToast,
    syncUiBlocked,
    doTravel,
    hotbarFromSave,
    persistHotbar,
    dialogue,
  });

  bindSocialUi({
    chatPanelEl: dom.chatPanelEl,
    partyPanelEl: dom.partyPanelEl,
    targetActionsEl: dom.targetActionsEl,
    getGame: state.getGame,
    getSave: state.getSave,
    showToast,
    syncUiBlocked,
    resurrectTarget,
  });

  function getGameCallbacks() {
    return createGameCallbacks({
      getSave: state.getSave,
      setSave: state.patchSave,
      getStats: state.getStats,
      setStats: state.setStats,
      getGame: state.getGame,
      hud,
      deathScreen: dom.deathScreen,
      updateHud: (s, st, opts) => updateHud(s, st ?? undefined, opts),
      showToast,
      syncUiBlocked,
      syncMountButton,
      showDialogue,
      openStationPanel,
      ensureMediaManifest,
      handleSkillsChanged,
      doTravel,
      syncPartyRegistry,
      syncPartyXpFromScene,
      refreshTargetActions,
      applyAllyResurrection,
    });
  }

  overlays.bind();

  const menuBoot = createMenuBootstrap({
    raceSelect: dom.raceSelect,
    genderSelect: dom.genderSelect,
    professionSelect: dom.professionSelect,
    playerNameInput: dom.playerNameInput,
    startBtn: dom.startBtn,
    createMenu,
    authMenu,
    getAccount: state.getAccount,
    setRaces: state.setRaces,
    setProfessions: state.setProfessions,
    setEnemies: state.setEnemies,
    setItems: state.setItems,
    setManifest: state.setManifest,
    setMenuBg,
    applyUiChrome,
    updateCreatePreview,
    startGameSession,
    pollPortrait,
    refreshSaveList: () => authMenu.refreshSaveList(),
    showAuthPanel: (message = '') => authMenu.showAuthPanel(message),
  });
  menuBoot.bindCreateButton();
  void menuBoot.initMenu();
}
