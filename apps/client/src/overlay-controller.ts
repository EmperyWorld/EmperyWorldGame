import type Phaser from 'phaser';
import { getGameScene } from './game/game-loader.js';
import { blurChat, focusChat, isChatFocused, startPartyChat } from './chat-ui.js';
import { closeRadio, isRadioOpen, openRadio } from './radio-ui.js';
import { closeShop, dismissShopConfirm, isShopOpen } from './shop-ui.js';
import { closeForge, isForgeOpen } from './forge-ui.js';
import { closeHousingStorage, isHousingStorageOpen } from './housing-ui.js';
import { closeStationPanel, isStationPanelOpen } from './station-ui.js';
import { closeSettings, isSettingsOpen, openSettings } from './settings-ui.js';
import {
  clearSkillsSearch,
  focusSkillsSearch,
  isSkillsOpen,
  isSkillsSearchFocused,
  renderSkillsPanel,
} from './skills-ui.js';
import { isInventoryOpen, renderInventory } from './inventory-ui.js';
import { isTravelOpen, renderTravelPanel } from './travel-ui.js';
import { playUiCue, unlockUiAudio } from './ui-audio.js';
import {
  isEnterHotkey,
  isEscapeHotkey,
  isLetterHotkey,
  isSlashHotkey,
  isTypingTarget,
} from './hotkeys.js';
import { gamepadInput } from './game/systems/gamepad-input.js';
import { bindBackdropDismiss } from './overlay-backdrop.js';

export interface OverlayControllerHost {
  getGame: () => Phaser.Game | null;
  getSave: () => unknown;
  isMenuHidden: () => boolean;
  isDialogueOpen: () => boolean;
  closeDialogue: () => void;
  refreshSkills: () => Promise<void>;
  returnToMenu: () => void;
  toggleAutoAttack: () => void;
  toggleMount: () => void;
  ensureDismounted: () => Promise<boolean>;
  handleRespawn: () => Promise<void>;
  reportBug: () => Promise<void>;
  showToast: (text: string) => void;
  closeSurvivalPanel: () => boolean;
}

/**
 * Inventory / skills / travel / radio panels + Esc/hotkeys + action buttons.
 */
export class OverlayController {
  private readonly els = {
    inventory: document.getElementById('inventory')!,
    travel: document.getElementById('travel')!,
    skills: document.getElementById('skills')!,
    deathScreen: document.getElementById('death-screen')!,
    travelClose: document.getElementById('travel-close') as HTMLButtonElement,
    menuBtn: document.getElementById('menu-btn')!,
    actionInventory: document.getElementById('action-inventory') as HTMLButtonElement,
    actionSkills: document.getElementById('action-skills') as HTMLButtonElement,
    actionTravel: document.getElementById('action-travel') as HTMLButtonElement,
    actionEnter: document.getElementById('action-enter') as HTMLButtonElement | null,
    actionRadio: document.getElementById('action-radio') as HTMLButtonElement,
    actionMount: document.getElementById('action-mount') as HTMLButtonElement,
    actionSettings: document.getElementById('action-settings') as HTMLButtonElement | null,
    actionBug: document.getElementById('action-bug') as HTMLButtonElement | null,
    actionAutoAttack: document.getElementById('action-auto-attack') as HTMLButtonElement,
    respawnBtn: document.getElementById('respawn-btn') as HTMLButtonElement,
    deathMenuBtn: document.getElementById('death-menu-btn') as HTMLButtonElement,
    continueBtn: document.getElementById('continue-btn') as HTMLButtonElement,
  };
  private padRaf = 0;
  private padAnnounced = false;

  constructor(private readonly host: OverlayControllerHost) {}

  bind(): void {
    this.els.travelClose.onclick = () => {
      this.els.travel.classList.remove('visible');
      this.syncUiBlocked();
    };
    this.els.menuBtn.onclick = () => this.host.returnToMenu();
    this.els.actionInventory.onclick = () => this.toggleInventory();
    this.els.actionSkills.onclick = () => void this.toggleSkills();
    this.els.actionTravel.onclick = () => void this.toggleTravel();
    this.els.actionEnter?.addEventListener('click', () => {
      unlockUiAudio();
      const game = this.host.getGame();
      if (!game) return;
      try {
        getGameScene(game).tryConfirmTravel();
      } catch {
        /* scene may be booting */
      }
    });
    this.els.actionRadio.onclick = () => void this.toggleRadio();
    this.els.actionMount.onclick = () => this.host.toggleMount();
    this.els.actionSettings?.addEventListener('click', () => this.toggleSettingsPanel());
    this.els.actionBug?.addEventListener('click', () => void this.host.reportBug());
    this.els.actionAutoAttack.onclick = () => this.host.toggleAutoAttack();
    this.els.respawnBtn.onclick = () => void this.host.handleRespawn();
    this.els.deathMenuBtn.onclick = () => this.host.returnToMenu();

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('gamepadconnected', () => {
      playUiCue('open');
      this.startPadLoop();
      if (!this.padAnnounced) {
        this.padAnnounced = true;
        this.host.showToast('Геймпад подключён. Нажми любую кнопку ещё раз.');
      }
    });
    window.addEventListener('gamepaddisconnected', () => {
      if (!this.hasConnectedPad()) this.stopPadLoop();
    });
    // Chrome hides pads until a button press; a click on the page then a poll can catch an already-open pad.
    window.addEventListener('pointerdown', () => {
      if (this.hasConnectedPad()) this.startPadLoop();
    });
    if (this.hasConnectedPad()) this.startPadLoop();

    bindBackdropDismiss(this.els.inventory, () => {
      if (this.els.inventory.classList.contains('visible')) this.toggleInventory();
    });
    bindBackdropDismiss(this.els.travel, () => {
      if (this.els.travel.classList.contains('visible')) void this.toggleTravel();
    });
    bindBackdropDismiss(this.els.skills, () => {
      if (this.els.skills.classList.contains('visible')) void this.toggleSkills();
    });
    bindBackdropDismiss(document.getElementById('settings'), () => {
      if (!isSettingsOpen()) return;
      closeSettings();
      this.syncUiBlocked();
    });
    bindBackdropDismiss(document.getElementById('shop'), () => {
      if (!isShopOpen()) return;
      if (dismissShopConfirm()) return;
      closeShop();
      this.syncUiBlocked();
    });
    bindBackdropDismiss(document.getElementById('radio'), () => {
      if (!isRadioOpen()) return;
      closeRadio();
      this.syncUiBlocked();
    });
    bindBackdropDismiss(document.getElementById('forge'), () => {
      if (!isForgeOpen()) return;
      closeForge();
      this.syncUiBlocked();
    });
    bindBackdropDismiss(document.getElementById('housing'), () => {
      if (!isHousingStorageOpen()) return;
      closeHousingStorage();
      this.syncUiBlocked();
    });
    bindBackdropDismiss(document.getElementById('station'), () => {
      if (!isStationPanelOpen()) return;
      closeStationPanel();
      this.syncUiBlocked();
    });
  }

  syncUiBlocked(): void {
    this.syncActionButtons();
    const game = this.host.getGame();
    if (!game) return;
    const blocked =
      isInventoryOpen() ||
      isTravelOpen() ||
      isSkillsOpen() ||
      isShopOpen() ||
      isForgeOpen() ||
      isHousingStorageOpen() ||
      isStationPanelOpen() ||
      isRadioOpen() ||
      isSettingsOpen() ||
      this.host.isDialogueOpen() ||
      isChatFocused() ||
      isTypingTarget() ||
      this.els.deathScreen.classList.contains('visible');
    try {
      const gs = getGameScene(game);
      gs.inputManager.setUiBlocked(blocked);
      // Флаг для ambient NPC: реже/пауза локальной толпы, онлайн не трогаем
      try {
        gs.registry.set('uiBlocked', blocked);
      } catch {
        /* ignore */
      }
      if (!blocked) {
        const canvas = game.canvas;
        if (canvas) {
          canvas.tabIndex = 0;
          canvas.focus({ preventScroll: true });
        }
      }
    } catch {
      /* scene not ready */
    }
  }

  private syncActionButtons(): void {
    const inv = isInventoryOpen();
    const skills = isSkillsOpen();
    const travel = isTravelOpen();
    const radio = isRadioOpen();
    const settings = isSettingsOpen();
    this.els.actionInventory.classList.toggle('open', inv);
    this.els.actionSkills.classList.toggle('open', skills);
    this.els.actionTravel.classList.toggle('open', travel);
    this.els.actionRadio.classList.toggle('open', radio);
    this.els.actionSettings?.classList.toggle('open', settings);
    this.els.actionInventory.setAttribute('aria-pressed', String(inv));
    this.els.actionSkills.setAttribute('aria-pressed', String(skills));
    this.els.actionTravel.setAttribute('aria-pressed', String(travel));
    this.els.actionRadio.setAttribute('aria-pressed', String(radio));
    this.els.actionSettings?.setAttribute('aria-pressed', String(settings));
  }

  closeAll(): void {
    this.host.closeDialogue();
    closeShop();
    closeForge();
    closeHousingStorage();
    closeStationPanel();
    closeSettings();
    blurChat();
    this.els.inventory.classList.remove('visible');
    this.els.travel.classList.remove('visible');
    this.els.skills.classList.remove('visible');
    this.els.deathScreen.classList.remove('visible');
    this.syncUiBlocked();
  }

  toggleInventory(): void {
    unlockUiAudio();
    this.els.inventory.classList.toggle('visible');
    if (this.els.inventory.classList.contains('visible')) {
      this.els.travel.classList.remove('visible');
      this.els.skills.classList.remove('visible');
      closeShop();
      closeForge();
      closeHousingStorage();
      closeStationPanel();
      closeRadio();
      closeSettings();
      void renderInventory();
      playUiCue('open');
    } else {
      playUiCue('close');
    }
    this.syncUiBlocked();
  }

  async toggleRadio(): Promise<void> {
    unlockUiAudio();
    if (isRadioOpen()) {
      closeRadio();
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    this.els.inventory.classList.remove('visible');
    this.els.travel.classList.remove('visible');
    this.els.skills.classList.remove('visible');
    closeSettings();
    closeShop();
    closeForge();
    closeHousingStorage();
    closeStationPanel();
    this.host.closeDialogue();
    await openRadio();
    playUiCue('open');
    this.syncUiBlocked();
  }

  async toggleTravel(): Promise<void> {
    unlockUiAudio();
    this.els.travel.classList.toggle('visible');
    if (this.els.travel.classList.contains('visible')) {
      this.els.inventory.classList.remove('visible');
      this.els.skills.classList.remove('visible');
      closeShop();
      closeForge();
      closeHousingStorage();
      closeStationPanel();
      closeSettings();
      this.syncUiBlocked();
      if (!await this.host.ensureDismounted()) {
        this.els.travel.classList.remove('visible');
        this.syncUiBlocked();
        return;
      }
      if (!this.els.travel.classList.contains('visible')) return;
      await renderTravelPanel();
      playUiCue('open');
    } else {
      playUiCue('close');
    }
    this.syncUiBlocked();
  }

  async toggleSkills(): Promise<void> {
    unlockUiAudio();
    this.els.skills.classList.toggle('visible');
    if (this.els.skills.classList.contains('visible')) {
      this.els.inventory.classList.remove('visible');
      this.els.travel.classList.remove('visible');
    closeSettings();
      closeShop();
      closeForge();
      closeHousingStorage();
      closeStationPanel();
      await this.host.refreshSkills();
      renderSkillsPanel();
      playUiCue('open');
    } else {
      playUiCue('close');
    }
    this.syncUiBlocked();
  }

  private hasConnectedPad(): boolean {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
      return [...navigator.getGamepads()].some((p) => Boolean(p));
    } catch {
      return false;
    }
  }

  private startPadLoop(): void {
    if (this.padRaf) return;
    const tick = (): void => {
      this.pollGamepad();
      this.padRaf = requestAnimationFrame(tick);
    };
    this.padRaf = requestAnimationFrame(tick);
  }

  private stopPadLoop(): void {
    if (!this.padRaf) return;
    cancelAnimationFrame(this.padRaf);
    this.padRaf = 0;
  }

  private overlayOpen(): boolean {
    return (
      isInventoryOpen() ||
      isTravelOpen() ||
      isSkillsOpen() ||
      isShopOpen() ||
      isForgeOpen() ||
      isHousingStorageOpen() ||
      isStationPanelOpen() ||
      isRadioOpen() ||
      isSettingsOpen() ||
      this.host.isDialogueOpen() ||
      this.els.deathScreen.classList.contains('visible')
    );
  }

  private pollGamepad(): void {
    gamepadInput.poll();
    if (isChatFocused() || isTypingTarget()) return;
    if (this.els.deathScreen.classList.contains('visible')) {
      if (gamepadInput.consume('south')) void this.host.handleRespawn();
      if (gamepadInput.consume('east') || gamepadInput.consume('start')) this.host.returnToMenu();
      return;
    }
    if (!this.host.isMenuHidden()) {
      if (gamepadInput.consume('south') || gamepadInput.consume('start')) {
        const btn = this.els.continueBtn;
        if (btn && btn.style.display !== 'none' && !btn.disabled) btn.click();
      }
      return;
    }
    const overlay = this.overlayOpen();
    if (gamepadInput.consume('start') || (overlay && gamepadInput.consume('east'))) {
      this.handleEscape();
      return;
    }
    if (!this.host.getSave()) return;
    if (this.host.isDialogueOpen()) return;
    if (gamepadInput.consume('north')) this.toggleInventory();
    if (gamepadInput.consume('back')) void this.toggleTravel();
    if (gamepadInput.consume('west')) this.toggleSettingsPanel();
    if (!overlay && gamepadInput.consume('r3')) this.host.toggleMount();
  }

  private handleEscape(): void {
    if (isChatFocused()) {
      blurChat();
      this.syncUiBlocked();
      return;
    }
    if (this.host.isDialogueOpen()) {
      this.host.closeDialogue();
      playUiCue('close');
      return;
    }
    if (isShopOpen()) {
      if (dismissShopConfirm()) {
        playUiCue('close');
        return;
      }
      closeShop();
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isForgeOpen()) {
      closeForge();
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isHousingStorageOpen()) {
      closeHousingStorage();
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isStationPanelOpen()) {
      closeStationPanel();
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isRadioOpen()) {
      closeRadio();
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isTravelOpen()) {
      this.els.travel.classList.remove('visible');
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isInventoryOpen()) {
      this.els.inventory.classList.remove('visible');
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isSkillsOpen()) {
      if (isSkillsSearchFocused() && clearSkillsSearch()) return;
      this.els.skills.classList.remove('visible');
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (isSettingsOpen()) {
      closeSettings();
      playUiCue('close');
      this.syncUiBlocked();
      return;
    }
    if (this.host.closeSurvivalPanel()) {
      playUiCue('close');
      return;
    }
    if (this.host.getSave() && this.host.isMenuHidden()) {
      this.host.returnToMenu();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.els.deathScreen.classList.contains('visible')) return;
    if (isEscapeHotkey(e)) {
      this.handleEscape();
      return;
    }

    if (!this.host.getSave() || !this.host.isMenuHidden()) return;
    // Чат / любое текстовое поле — не трогаем хоткеи (и EN, и RU раскладка)
    if (isChatFocused() || isTypingTarget()) return;

    if (isEnterHotkey(e)) {
      e.preventDefault();
      focusChat();
      this.syncUiBlocked();
      return;
    }

    if (isLetterHotkey(e, 'p')) {
      e.preventDefault();
      startPartyChat();
      this.syncUiBlocked();
      return;
    }
    if (isLetterHotkey(e, 'i')) {
      e.preventDefault();
      this.toggleInventory();
    }
    if (isLetterHotkey(e, 'k')) {
      e.preventDefault();
      void this.toggleSkills();
    }
    if (isLetterHotkey(e, 't')) {
      e.preventDefault();
      void this.toggleTravel();
    }
    if (isLetterHotkey(e, 'r')) {
      e.preventDefault();
      const game = this.host.getGame();
      if (game) {
        try {
          if (getGameScene(game).tryConfirmTravel()) return;
        } catch {
          /* scene may be booting */
        }
      }
      void this.toggleRadio();
    }
    if (isLetterHotkey(e, 'h')) {
      e.preventDefault();
      this.host.toggleMount();
    }
    if (isLetterHotkey(e, 'o')) {
      e.preventDefault();
      this.toggleSettingsPanel();
    }
    if (isLetterHotkey(e, 'b')) {
      e.preventDefault();
      void this.host.reportBug();
    }
    if (isSkillsOpen() && isSlashHotkey(e) && !isSkillsSearchFocused()) {
      e.preventDefault();
      focusSkillsSearch();
    }
  }

  private toggleSettingsPanel(): void {
    unlockUiAudio();
    if (!isSettingsOpen()) {
      this.els.inventory.classList.remove('visible');
      this.els.travel.classList.remove('visible');
      this.els.skills.classList.remove('visible');
      closeShop();
      closeForge();
      closeHousingStorage();
      closeStationPanel();
      closeRadio();
      this.host.closeDialogue();
      openSettings();
      playUiCue('open');
    } else {
      closeSettings();
      playUiCue('close');
    }
    this.syncUiBlocked();
  }
}
