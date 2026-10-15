import { dialoguePortraitId } from '@empery/shared/dialogue-portraits';
import {
  havenScheduleEntryById,
} from '@empery/shared';
import { npcAvailableForInteraction } from './game/systems/npc-availability.js';
import type { WorldNavigationTarget } from '@empery/shared';
import {
  applyDialogueChoice,
  buyHousing,
  enterHousing,
  fetchDialogue,
  fetchStats,
  restAtHousing,
  type DialogueResponse,
  type HousingStorageKind,
  type LocationDefinition,
  type PlayerSave,
  type PlayerStats,
} from './api.js';
import { isDigitHotkey, isEnterHotkey, isTypingTarget } from './hotkeys.js';
import { friendlyUiError } from './ui-errors.js';
import { getHavenSchedule, getWorldGameHour, getAbsoluteGameHours } from './world-clock.js';
import { gamepadInput } from './game/systems/gamepad-input.js';

export interface DialogueControllerHost {
  getSave: () => PlayerSave | null;
  setSave: (save: PlayerSave) => void;
  getStats: () => PlayerStats | null;
  setStats: (stats: PlayerStats) => void;
  updateHud: (save: PlayerSave, stats?: PlayerStats) => void;
  assetUrl: (assetId: string) => string | undefined;
  showToast: (text: string) => void;
  syncUiBlocked: () => void;
  openMerchantShop: () => Promise<void>;
  openArmorShop: () => Promise<void>;
  openProvisionsShop: () => Promise<void>;
  openFishShop: () => Promise<void>;
  openButcherShop: () => Promise<void>;
  openBakeryShop: () => Promise<void>;
  openBrewShop: () => Promise<void>;
  openSuppliesShop: () => Promise<void>;
  openApothecaryShop: () => Promise<void>;
  openRadioShop: () => Promise<void>;
  openStableShop: () => Promise<void>;
  openForge: () => Promise<void>;
  openHousingStorage: (kind: HousingStorageKind) => Promise<void>;
  /** Current location id (for NPC schedule). */
  getLocationId?: () => string | undefined;
  /** Pause NPC movement during conversation. */
  setTalkingNpc?: (npcId: string | null) => void;
  getCitizenPortrait?: (npcId:string)=>string|null;
  /** Put a destination on the current world map and minimap. */
  setNavigationTarget?: (target: WorldNavigationTarget) => boolean;
  /** Travel into apartment after buy/enter (same path as portal travel). */
  enterApartmentLocation?: (location: LocationDefinition, save: PlayerSave, stats: PlayerStats) => Promise<void>;
}

const TYPE_MS = 28;
const TYPE_CHARS = 2;

/** Dialogue scene DOM + portrait preload / choice preview. */
export class DialogueController {
  private epoch = 0;
  private requestAbort?: AbortController;
  private choiceBusy = false;
  private portraitEpoch = 0;
  private choiceKeys = new Map<string, string>();

  private captureContext(): () => boolean {
    const epoch = this.epoch;
    const save = this.host.getSave();
    const location = this.host.getLocationId?.();
    return () => this.epoch === epoch && this.host.getSave()?.id === save?.id && this.host.getSave()?.location === save?.location && this.host.getLocationId?.() === location;
  }

  private acceptSave(save: PlayerSave): boolean {
    return (save.revision ?? 0) >= (this.host.getSave()?.revision ?? 0);
  }

  private channel: 'proximity' | 'radio' = 'proximity';
  private lastPortraitUrl = '';
  private basePortrait: string | undefined;
  private typeTimer: ReturnType<typeof setInterval> | null = null;
  private fullText = '';
  private typing = false;
  private afterType: (() => void) | null = null;
  private choiceHandlers: Array<() => void> = [];
  private padFocus = 0;
  private padRaf = 0;
  private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e);

  private readonly els = {
    scene: document.getElementById('dialogue-scene')!,
    npcName: document.getElementById('dialogue-npc-name')!,
    channel: document.getElementById('dialogue-channel')!,
    text: document.getElementById('dialogue-text')!,
    portrait: document.getElementById('dialogue-portrait') as HTMLImageElement,
    placeholder: document.getElementById('dialogue-portrait-placeholder')!,
    choices: document.getElementById('dialogue-choices')!,
    close: document.getElementById('dialogue-close') as HTMLButtonElement,
  };

  constructor(private readonly host: DialogueControllerHost) {
    this.els.close.onclick = () => this.close();
    this.els.text.addEventListener('click', () => this.skipTypewriter());
    window.addEventListener('gamepadconnected', () => {
      if (this.isOpen()) this.startPadLoop();
    });
  }

  isOpen(): boolean {
    return this.els.scene.classList.contains('visible');
  }

  close(): void {
    this.epoch++;
    this.portraitEpoch++;
    this.requestAbort?.abort();
    this.requestAbort = undefined;
    this.choiceBusy = false;
    this.choiceKeys.clear();
    this.stopTypewriter();
    this.stopPadLoop();
    this.choiceHandlers = [];
    this.padFocus = 0;
    window.removeEventListener('keydown', this.onKeyDown);
    this.els.scene.classList.remove('visible');
    this.lastPortraitUrl = '';
    this.basePortrait = undefined;
    this.host.setTalkingNpc?.(null);
    this.host.syncUiBlocked();
  }

  async show(npcId: string, channel: 'proximity' | 'radio' = 'proximity'): Promise<void> {
    const save = this.host.getSave();
    if (!save) return;

    const hour = getWorldGameHour();
    const locationId = this.host.getLocationId?.();
    const havenSched = locationId === 'empery_haven' ? getHavenSchedule() : null;
    const schedEntry = havenSched ? havenScheduleEntryById(havenSched, npcId) : null;
    // Ambient actors are selected by their live availability; district dialogue
    // ids deliberately have no individual service-NPC schedule entry.
    const canInteract = npcId.startsWith('haven_citizen_') || npcAvailableForInteraction(
      npcId, locationId ?? save.location, hour, schedEntry ?? undefined, true, getAbsoluteGameHours(),
    );

    if (channel === 'proximity' && !canInteract) {
      this.host.showToast(schedEntry?.asleep ? 'Закрыто до утра.' : 'Персонаж сейчас недоступен.');
      return;
    }

    if (
      channel === 'radio' &&
      (npcId === 'town_merchant' ||
        npcId === 'town_radio' ||
        npcId === 'town_stable' ||
        npcId === 'town_blacksmith' ||
        npcId === 'town_innkeeper' ||
        npcId === 'town_innkeeper_day' ||
        npcId === 'town_dockhand' ||
        npcId === 'town_fisher' ||
        npcId === 'town_butcher' ||
        npcId === 'town_miller' ||
        npcId === 'town_brewer' ||
        npcId === 'apartment_chest' ||
        npcId === 'apartment_rack' ||
        npcId === 'apartment_fridge' ||
        npcId === 'apartment_bed')
    ) {
      this.host.showToast('По рации нельзя вызвать городские сервисы.');
      return;
    }

    this.close();
    this.channel = channel;
    const current = this.captureContext();
    const controller = new AbortController();
    this.requestAbort = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
    this.host.setTalkingNpc?.(channel === 'proximity' ? npcId : null);
    this.els.npcName.textContent = '...';
    this.els.channel.dataset.channel = channel;
    this.els.channel.textContent = channel === 'radio' ? 'Рация' : 'Разговор';
    this.els.text.textContent = '';
    this.els.choices.innerHTML = '';
    this.els.scene.classList.add('visible');
    this.els.portrait.classList.remove('visible', 'portrait-swap');
    this.els.placeholder.style.display = 'grid';
    window.removeEventListener('keydown', this.onKeyDown);
    window.addEventListener('keydown', this.onKeyDown);
    this.startPadLoop();
    this.host.syncUiBlocked();

    try {
      const response = await fetchDialogue(save.id, npcId, channel, signal);
      if (!current()) return;
      if (response.save && this.acceptSave(response.save)) {
        this.host.setSave(response.save);
        this.host.updateHud(response.save, this.host.getStats() ?? undefined);
      }
      this.render(response, npcId);
    } catch (err) {
      if (!current()) return;
      this.close();
      this.host.showToast(friendlyUiError(err, 'Связь не удалась'));
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.isOpen()) return;
    if (isTypingTarget()) return;

    if (this.typing && (isEnterHotkey(e) || e.code === 'Space' || e.key === ' ')) {
      e.preventDefault();
      this.skipTypewriter();
      return;
    }

    if (this.typing) return;

    for (let n = 1; n <= 9; n++) {
      if (!isDigitHotkey(e, n)) continue;
      const handler = this.choiceHandlers[n - 1];
      if (handler) {
        e.preventDefault();
        handler();
      }
      return;
    }
  }

  private startPadLoop(): void {
    if (this.padRaf) return;
    // Chrome fires gamepadconnected before getGamepads() is populated — do not bail.
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

  private pollGamepad(): void {
    if (!this.isOpen() || isTypingTarget()) return;
    gamepadInput.poll();
    if (this.typing) {
      if (gamepadInput.consume('south')) this.skipTypewriter();
      return;
    }
    if (gamepadInput.consume('dpadUp')) this.movePadFocus(-1);
    if (gamepadInput.consume('dpadDown')) this.movePadFocus(1);
    if (gamepadInput.consume('south')) {
      this.choiceHandlers[this.padFocus]?.();
    }
  }

  private movePadFocus(delta: number): void {
    const n = this.choiceHandlers.length;
    if (n === 0) return;
    this.padFocus = (this.padFocus + delta + n) % n;
    this.syncPadFocus();
  }

  private syncPadFocus(): void {
    const buttons = this.els.choices.querySelectorAll<HTMLButtonElement>('.choice-btn');
    buttons.forEach((btn, i) => {
      const on = i === this.padFocus;
      btn.classList.toggle('pad-focus', on);
      if (on) btn.focus({ preventScroll: true });
    });
  }

  private async handleChoice(npcId: string, choiceId: string): Promise<void> {
    if (this.choiceBusy || !this.isOpen()) return;
    const current = this.captureContext();
    const handlers = this.choiceHandlers;
    this.choiceBusy = true;
    for (const button of this.els.choices.querySelectorAll('button')) button.disabled = true;
    try { await this.performChoice(npcId, choiceId); }
    catch (err) {
      if (current() && this.isOpen()) {
        this.choiceHandlers = handlers;
        this.host.showToast(friendlyUiError(err, 'Не удалось выполнить действие'));
      }
    } finally {
      if (current()) {
        this.choiceBusy = false;
        for (const button of this.els.choices.querySelectorAll('button')) button.disabled = false;
      }
    }
  }

  private async performChoice(npcId: string, choiceId: string): Promise<void> {
    const save = this.host.getSave();
    if (!save) return;
    let current = this.captureContext();
    this.choiceHandlers = [];

    if (
      (npcId === 'town_innkeeper' || npcId === 'town_innkeeper_day') &&
      choiceId === 'inn_provisions'
    ) {
      this.close(); current = this.captureContext();
      await this.host.openProvisionsShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_fisher' && choiceId === 'fisher_shop') {
      this.close(); current = this.captureContext();
      await this.host.openFishShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_butcher' && choiceId === 'butcher_shop') {
      this.close(); current = this.captureContext();
      await this.host.openButcherShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_merchant' && choiceId === 'merchant_shop') {
      this.close(); current = this.captureContext();
      await this.host.openMerchantShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_radio' && choiceId === 'radio_shop') {
      this.close(); current = this.captureContext();
      await this.host.openRadioShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_stable' && choiceId === 'stable_shop') {
      this.close(); current = this.captureContext();
      await this.host.openStableShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_miller' && choiceId === 'miller_shop') {
      this.close(); current = this.captureContext();
      await this.host.openBakeryShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_brewer' && choiceId === 'brew_shop') {
      this.close(); current = this.captureContext();
      await this.host.openBrewShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_dockhand' && choiceId === 'dock_supplies') {
      this.close(); current = this.captureContext();
      await this.host.openSuppliesShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_healer' && choiceId === 'healer_shop') {
      this.close(); current = this.captureContext();
      await this.host.openApothecaryShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_blacksmith' && choiceId === 'forge_armor') {
      this.close(); current = this.captureContext();
      await this.host.openArmorShop();
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'town_blacksmith' && choiceId === 'forge_open') {
      this.close(); current = this.captureContext();
      await this.host.openForge();
      this.host.syncUiBlocked();
      return;
    }

    if (npcId === 'apartment_chest' && choiceId === 'open_storage') {
      this.close(); current = this.captureContext();
      await this.host.openHousingStorage('materials');
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'apartment_rack' && choiceId === 'open_storage') {
      this.close(); current = this.captureContext();
      await this.host.openHousingStorage('gear');
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'apartment_fridge' && choiceId === 'open_storage') {
      this.close(); current = this.captureContext();
      await this.host.openHousingStorage('food');
      this.host.syncUiBlocked();
      return;
    }
    if (npcId === 'apartment_bed' && choiceId === 'rest_here') {
      this.close(); current = this.captureContext();
      try {
        const result = await restAtHousing(save.id);
        if (!current()) return;
        if (!this.acceptSave(result.save)) return;
        this.host.setSave(result.save);
        this.host.setStats(result.stats);
        this.host.updateHud(result.save, result.stats);
        this.host.showToast(result.message);
      } catch (err) {
        if (!current()) return;
        this.host.showToast(friendlyUiError(err, 'Не удалось отдохнуть'));
      }
      this.host.syncUiBlocked();
      return;
    }

    if (npcId === 'town_steward' && (choiceId === 'steward_buy_1' || choiceId === 'steward_buy_2' || choiceId === 'steward_buy_3')) {
      const tier = choiceId === 'steward_buy_1' ? 1 : choiceId === 'steward_buy_2' ? 2 : 3;
      try {
        const result = await buyHousing(save.id, tier);
        if (!current()) return;
        if (!this.acceptSave(result.save)) return;
        this.host.setSave(result.save);
        this.host.setStats(result.stats);
        this.host.updateHud(result.save, result.stats);
        this.host.showToast(result.message);
        this.close(); current = this.captureContext();
        if (this.host.enterApartmentLocation) {
          const entered = await enterHousing(result.save.id);
          if (!current()) return;
          if (!this.acceptSave(entered.save)) return;
          this.host.setSave(entered.save);
          this.host.setStats(entered.stats);
          this.host.updateHud(entered.save, entered.stats);
          this.host.showToast(entered.message);
          await this.host.enterApartmentLocation(entered.location, entered.save, entered.stats);
        }
      } catch (err) {
        if (!current()) return;
        this.host.showToast(friendlyUiError(err, 'Не удалось купить квартиру'));
        this.close(); current = this.captureContext();
      }
      this.host.syncUiBlocked();
      return;
    }

    if (npcId === 'town_steward' && choiceId === 'steward_enter') {
      try {
        const entered = await enterHousing(save.id);
        if (!current()) return;
        if (!this.acceptSave(entered.save)) return;
        this.host.setSave(entered.save);
        this.host.setStats(entered.stats);
        this.host.updateHud(entered.save, entered.stats);
        this.host.showToast(entered.message);
        this.close(); current = this.captureContext();
        if (this.host.enterApartmentLocation) {
          await this.host.enterApartmentLocation(entered.location, entered.save, entered.stats);
        }
      } catch (err) {
        if (!current()) return;
        this.host.showToast(friendlyUiError(err, 'Не удалось войти в квартиру'));
        this.close(); current = this.captureContext();
      }
      this.host.syncUiBlocked();
      return;
    }

    const signal = AbortSignal.any([this.requestAbort?.signal ?? new AbortController().signal, AbortSignal.timeout(30_000)]);
    let key = this.choiceKeys.get(choiceId);
    if (!key) { key = crypto.randomUUID(); this.choiceKeys.set(choiceId, key); }
    const result = await applyDialogueChoice(save.id, npcId, choiceId, this.channel, signal, key);
    if (!current()) return;
    const stats = await fetchStats(result.save.id, signal);
    if (!current()) return;
    if (!this.acceptSave(result.save)) { this.close(); return; }
    this.host.setSave(result.save);
    this.host.setStats(stats);
    this.host.updateHud(result.save, stats);
    if (result.townMessage) this.host.showToast(result.townMessage);
    if (result.followUp) this.render(result.followUp, npcId);
    else this.close();
  }

  private render(response: DialogueResponse, npcId: string): void {
    this.choiceKeys.clear();
    if (
      response.navigationTarget &&
      this.host.setNavigationTarget?.(response.navigationTarget)
    ) {
      this.host.showToast(`Маршрут отмечен: ${response.navigationTarget.label}`);
    }
    this.els.scene.classList.add('visible');
    this.els.npcName.textContent = response.npcName ?? npcId;
    this.els.channel.dataset.channel = this.channel;
    this.els.channel.textContent = this.channel === 'radio' ? 'Рация' : 'Разговор';
    this.els.choices.innerHTML = '';
    this.choiceHandlers = [];
    this.basePortrait = response.portrait;
    this.preloadPortraits(response, npcId);
    this.setPortrait(response.portrait, npcId);
    this.startTypewriter(response.text, () => this.buildChoices(response, npcId));
  }

  private buildChoices(response: DialogueResponse, npcId: string): void {
    this.els.choices.innerHTML = '';
    this.choiceHandlers = [];

    const current = this.captureContext();
    const choices =
      response.choices.length > 0
        ? response.choices
        : [{ id: '__close__', label: 'Закрыть', portrait: undefined as string | undefined }];

    choices.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';

      const key = document.createElement('span');
      key.className = 'choice-key';
      key.textContent = String(index + 1);
      btn.appendChild(key);

      if (choice.portrait) {
        btn.classList.add('has-portrait');
        const thumbUrl = this.host.assetUrl(this.host.getCitizenPortrait?.(npcId) ?? choice.portrait);
        if (thumbUrl) {
          const thumb = document.createElement('img');
          thumb.className = 'choice-thumb';
          thumb.src = thumbUrl;
          thumb.alt = '';
          btn.appendChild(thumb);
        }
      }

      const label = document.createElement('span');
      label.className = 'choice-label';
      label.textContent = choice.label;
      btn.appendChild(label);

      const preview = (): void => {
        if (choice.portrait) this.setPortrait(choice.portrait, npcId);
        btn.classList.add('preview-active');
      };
      const restore = (): void => {
        this.setPortrait(this.basePortrait, npcId);
        btn.classList.remove('preview-active');
      };

      const activate = (): void => {
        if (!current() || !this.isOpen() || this.choiceBusy) return;
        if (choice.id === '__close__') this.close();
        else void this.handleChoice(npcId, choice.id);
      };

      btn.onmouseenter = preview;
      btn.onmouseleave = restore;
      btn.onfocus = preview;
      btn.onblur = restore;
      btn.onclick = activate;
      this.choiceHandlers.push(activate);
      this.els.choices.appendChild(btn);
    });
    this.padFocus = 0;
    this.syncPadFocus();
  }

  private startTypewriter(text: string, onDone: () => void): void {
    this.stopTypewriter();
    this.fullText = text;
    this.afterType = onDone;
    this.els.text.replaceChildren();
    this.typing = true;
    let i = 0;
    const node = document.createTextNode('');
    const caret = document.createElement('span');
    caret.className = 'dlg-caret';
    caret.setAttribute('aria-hidden', 'true');
    this.els.text.append(node, caret);

    this.typeTimer = setInterval(() => {
      i = Math.min(text.length, i + TYPE_CHARS);
      node.nodeValue = text.slice(0, i);
      if (i >= text.length) this.finishTypewriter();
    }, TYPE_MS);
  }

  private skipTypewriter(): void {
    if (!this.typing) return;
    this.finishTypewriter();
  }

  private finishTypewriter(): void {
    const done = this.afterType;
    this.stopTypewriter();
    this.els.text.textContent = this.fullText;
    done?.();
  }

  private stopTypewriter(): void {
    if (this.typeTimer) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.typing = false;
    this.afterType = null;
  }

  private preloadPortraits(response: DialogueResponse, npcId: string): void {
    if (this.host.getCitizenPortrait?.(npcId)) return;
    const ids = new Set<string>();
    if (response.portrait) ids.add(response.portrait);
    for (const choice of response.choices) {
      if (choice.portrait) ids.add(choice.portrait);
    }
    for (const id of ids) {
      const url = this.host.assetUrl(id);
      if (!url) continue;
      const img = new Image();
      img.src = url;
    }
  }

  private setPortrait(assetId: string | undefined, npcId: string): void {
    const epoch = ++this.portraitEpoch;
    const current = (): boolean => epoch === this.portraitEpoch && this.isOpen();
    const individual=this.host.getCitizenPortrait?.(npcId);
    const id = individual ?? assetId ?? dialoguePortraitId(npcId, 'neutral');
    const url =
      individual ? this.host.assetUrl(individual) :
      this.host.assetUrl(id) ??
      this.host.assetUrl(dialoguePortraitId(npcId, 'neutral')) ??
      this.host.assetUrl(dialoguePortraitId(npcId, 'serious')) ??
      this.host.assetUrl(dialoguePortraitId(npcId, 'action'));

    if (!url) {
      this.els.portrait.classList.remove('visible', 'portrait-swap');
      this.els.placeholder.style.display = 'grid';
      this.lastPortraitUrl = '';
      return;
    }

    if (url === this.lastPortraitUrl && this.els.portrait.classList.contains('visible')) {
      return;
    }

    this.els.placeholder.style.display = 'none';

    const apply = (): void => {
      if (!current()) return;
      this.els.portrait.src = url;
      this.els.portrait.classList.remove('portrait-swap');
      requestAnimationFrame(() => { if (current()) this.els.portrait.classList.add('visible'); });
      this.lastPortraitUrl = url;
    };

    if (this.lastPortraitUrl && this.els.portrait.classList.contains('visible')) {
      this.els.portrait.classList.add('portrait-swap');
      const preload = new Image();
      preload.onload = apply;
      preload.onerror = () => {
        if (!current()) return;
        this.els.portrait.classList.remove('visible', 'portrait-swap');
        this.els.placeholder.style.display = 'grid';
        this.lastPortraitUrl = '';
      };
      preload.src = url;
      return;
    }

    this.els.portrait.classList.remove('visible');
    const preload = new Image();
    preload.onload = apply;
    preload.onerror = () => {
      if (!current()) return;
      this.els.portrait.classList.remove('visible', 'portrait-swap');
      this.els.placeholder.style.display = 'grid';
      this.lastPortraitUrl = '';
    };
    preload.src = url;
  }
}
