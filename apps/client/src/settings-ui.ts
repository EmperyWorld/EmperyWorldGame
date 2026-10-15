import {
  GRAPHICS_CHANGED_EVENT,
  getGraphicsQuality,
  graphicsQualityLabel,
  type GraphicsQuality,
  setGraphicsQuality,
} from './game/systems/graphics-quality.js';
import {
  type ChatOpacityModeSetting,
  getClientSetting,
  setClientSetting,
  type SettingsTabSetting,
  type UiScaleSetting,
} from './settings-store.js';
import { isUiAudioMuted, setUiAudioMuted } from './ui-audio.js';

const QUALITY_ORDER: readonly GraphicsQuality[] = [
  'high',
  'ultra_sane_90',
  'ultra_sane',
  'balanced',
  'performance',
];

type SettingsTab = SettingsTabSetting;

const DEFAULT_QUALITY: GraphicsQuality = 'balanced';
const DEFAULT_SURVIVAL_FX_REDUCED = false;
const DEFAULT_PERF_OVERLAY = false;
const DEFAULT_HUD_HINTS = true;
const DEFAULT_UI_AUDIO_ENABLED = true;
const DEFAULT_CHAT_OPACITY: ChatOpacityModeSetting = 'semi';
const DEFAULT_UI_SCALE: UiScaleSetting = 100;
const UI_SCALE_OPTIONS: readonly UiScaleSetting[] = [75, 100, 125, 150];

interface SettingsHost {
  onClose?: () => void;
  onToast?: (text: string) => void;
}

let root: HTMLElement | null = null;
let host: SettingsHost | null = null;
let activeTab: SettingsTab = 'graphics';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function isReducedSurvivalFx(): boolean {
  return getClientSetting('survivalFxReduced');
}

function getActiveTab(): SettingsTab {
  return getClientSetting('settingsTab');
}

function setActiveTab(next: SettingsTab): void {
  activeTab = next;
  setClientSetting('settingsTab', next);
}

function isPerfOverlayEnabled(): boolean {
  return getClientSetting('perfOverlayEnabled');
}

function areHudHintsVisible(): boolean {
  return getClientSetting('hudHintsVisible');
}

function applySurvivalFx(reduced: boolean): void {
  setClientSetting('survivalFxReduced', reduced);
  document.body.classList.toggle('survival-fx-reduced', reduced);
}

function setPerfOverlayEnabled(enabled: boolean): void {
  setClientSetting('perfOverlayEnabled', enabled);
}

function applyHudHintsVisible(visible: boolean): void {
  setClientSetting('hudHintsVisible', visible);
  document.body.classList.toggle('hud-hints-hidden', !visible);
}

function applyChatOpacityMode(mode: ChatOpacityModeSetting): void {
  setClientSetting('chatOpacityMode', mode);
  document.body.classList.remove('chat-opacity-transparent', 'chat-opacity-semi', 'chat-opacity-opaque');
  document.body.classList.add(`chat-opacity-${mode}`);
}

function getChatOpacityMode(): ChatOpacityModeSetting {
  return getClientSetting('chatOpacityMode');
}

function applyUiScale(scale: UiScaleSetting): void {
  setClientSetting('uiScale', scale);
  const factor = Math.max(0.75, Math.min(1.5, scale / 100));
  document.documentElement.style.setProperty('--ui-scale', String(factor));
}

function getUiScale(): UiScaleSetting {
  return getClientSetting('uiScale');
}

function applyDefaults(): void {
  setGraphicsQuality(DEFAULT_QUALITY);
  applySurvivalFx(DEFAULT_SURVIVAL_FX_REDUCED);
  setPerfOverlayEnabled(DEFAULT_PERF_OVERLAY);
  applyHudHintsVisible(DEFAULT_HUD_HINTS);
  setUiAudioMuted(!DEFAULT_UI_AUDIO_ENABLED);
  applyChatOpacityMode(DEFAULT_CHAT_OPACITY);
  applyUiScale(DEFAULT_UI_SCALE);
  setClientSetting('chatCollapsed', true);
  setActiveTab('graphics');
}

function graphicsHint(quality: GraphicsQuality): string {
  if (quality === 'high') return 'Макс визуал, без FPS-лимита.';
  if (quality === 'ultra_sane_90') return 'Визуал high, но жёсткий лимит 90 FPS.';
  if (quality === 'ultra_sane') return 'Оптимальный баланс: 60 FPS и плотная сцена.';
  if (quality === 'balanced') return 'Комфортный режим по умолчанию.';
  return 'Максимальный FPS-резерв для слабого железа.';
}

function renderTabs(): string {
  const tabs: readonly { id: SettingsTab; label: string }[] = [
    { id: 'graphics', label: 'Графика' },
    { id: 'interface', label: 'Интерфейс' },
    { id: 'controls', label: 'Управление' },
  ];
  return tabs
    .map((tab) => {
      const active = tab.id === activeTab;
      return `<button type="button" class="settings-tab-btn${active ? ' active' : ''}" data-settings-tab="${tab.id}" aria-pressed="${active}">${tab.label}</button>`;
    })
    .join('');
}

function renderGraphicsTab(): string {
  const qualityButtons = QUALITY_ORDER.map((quality) => {
    const active = quality === getGraphicsQuality();
    return `<button type="button" class="settings-quality-btn${active ? ' active' : ''}" data-quality="${quality}" aria-pressed="${active}">
      <span class="settings-quality-title">${graphicsQualityLabel(quality)}</span>
      <span class="settings-quality-hint">${graphicsHint(quality)}</span>
    </button>`;
  }).join('');
  return `
    <section class="settings-section">
      <h3>Профили</h3>
      <p class="settings-hint">Смена профиля применяется сразу, без перезапуска клиента.</p>
      <div class="settings-quality-grid">${qualityButtons}</div>
    </section>
    <section class="settings-section">
      <h3>Текущий режим</h3>
      <p class="settings-hint">Сейчас: <strong>${graphicsQualityLabel(getGraphicsQuality())}</strong></p>
      <p class="settings-hint">Если в городе высокий нагрев GPU, начни с «ультра-90» или «ультра-сбаланс».</p>
    </section>
  `;
}

function renderInterfaceTab(): string {
  const chatMode = getChatOpacityMode();
  const uiScale = getUiScale();
  return `
    <section class="settings-section">
      <h3>Комфорт интерфейса</h3>
      <label class="settings-toggle">
        <input id="settings-ui-audio" type="checkbox" ${isUiAudioMuted() ? '' : 'checked'} />
        <span>Звуки интерфейса и города</span>
      </label>
      <label class="settings-toggle">
        <input id="settings-hud-hints" type="checkbox" ${areHudHintsVisible() ? 'checked' : ''} />
        <span>Подсказки управления на HUD</span>
      </label>
      <label class="settings-toggle">
        <input id="settings-survival-fx" type="checkbox" ${isReducedSurvivalFx() ? 'checked' : ''} />
        <span>Слабые эффекты выживания</span>
      </label>
      <label class="settings-toggle">
        <input id="settings-perf-overlay" type="checkbox" ${isPerfOverlayEnabled() ? 'checked' : ''} />
        <span>Perf HUD (FPS/heap)</span>
      </label>
      <div class="settings-subtitle">Фон чата</div>
      <div class="settings-choice-row">
        <button type="button" class="settings-choice-btn${chatMode === 'transparent' ? ' active' : ''}" data-chat-opacity="transparent">Прозрачный</button>
        <button type="button" class="settings-choice-btn${chatMode === 'semi' ? ' active' : ''}" data-chat-opacity="semi">Полупрозрачный</button>
        <button type="button" class="settings-choice-btn${chatMode === 'opaque' ? ' active' : ''}" data-chat-opacity="opaque">Непрозрачный</button>
      </div>
      <div class="settings-subtitle">Масштаб интерфейса</div>
      <div class="settings-choice-row">
        ${UI_SCALE_OPTIONS.map((scale) => `<button type="button" class="settings-choice-btn${uiScale === scale ? ' active' : ''}" data-ui-scale="${scale}">${scale}%</button>`).join('')}
      </div>
      <p class="settings-hint">Perf HUD появится после следующего входа в локацию.</p>
    </section>
  `;
}

function renderControlsTab(): string {
  return `
    <section class="settings-section">
      <h3>Горячие клавиши</h3>
      <div class="settings-keys-grid">
        <div class="settings-key-row"><kbd>I</kbd><span>Инвентарь</span></div>
        <div class="settings-key-row"><kbd>K</kbd><span>Навыки</span></div>
        <div class="settings-key-row"><kbd>T</kbd><span>Путешествие</span></div>
        <div class="settings-key-row"><kbd>R</kbd><span>Рация / вход в портал</span></div>
        <div class="settings-key-row"><kbd>H</kbd><span>Конь</span></div>
        <div class="settings-key-row"><kbd>O</kbd><span>Настройки</span></div>
        <div class="settings-key-row"><kbd>Esc</kbd><span>Закрыть текущее окно</span></div>
        <div class="settings-key-row"><kbd>Enter</kbd><span>Фокус в чат</span></div>
      </div>
    </section>
    <section class="settings-section">
      <h3>Геймпад</h3>
      <p class="settings-hint">Start закрывает текущее окно. West открывает настройки.</p>
    </section>
  `;
}

function render(): void {
  if (!root) return;
  const tabBody =
    activeTab === 'graphics'
      ? renderGraphicsTab()
      : activeTab === 'interface'
        ? renderInterfaceTab()
        : renderControlsTab();

  root.innerHTML = `
    <div id="settings-panel" role="dialog" aria-label="Настройки">
      <div id="settings-header">
        <div class="settings-title-row">
          <h2>Настройки</h2>
          <span class="settings-header-key">[O]</span>
        </div>
        <button id="settings-close" type="button">Закрыть</button>
      </div>
      <div class="settings-tabs">${renderTabs()}</div>
      <div id="settings-body">
        ${tabBody}
      </div>
      <div class="settings-footer">
        <button id="settings-reset" type="button" class="settings-reset-btn">Сбросить по умолчанию</button>
        <span class="settings-hint">Все настройки сохраняются локально в браузере.</span>
      </div>
    </div>
  `;

  el<HTMLButtonElement>('settings-close').onclick = () => closeSettings();
  el<HTMLButtonElement>('settings-reset').onclick = () => {
    applyDefaults();
    render();
    host?.onToast?.('Настройки сброшены');
  };
  root.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((btn) => {
    btn.onclick = () => {
      const next = btn.dataset.settingsTab;
      if (next !== 'graphics' && next !== 'interface' && next !== 'controls') return;
      setActiveTab(next);
      render();
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((btn) => {
    btn.onclick = () => {
      const next = btn.dataset.quality as GraphicsQuality | undefined;
      if (!next) return;
      const changed = next !== getGraphicsQuality();
      setGraphicsQuality(next);
      render();
      if (changed) host?.onToast?.(`Графика: ${graphicsQualityLabel(next)}`);
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-chat-opacity]').forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.chatOpacity;
      if (mode !== 'transparent' && mode !== 'semi' && mode !== 'opaque') return;
      applyChatOpacityMode(mode);
      render();
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-ui-scale]').forEach((btn) => {
    btn.onclick = () => {
      const raw = Number(btn.dataset.uiScale);
      if (raw !== 75 && raw !== 100 && raw !== 125 && raw !== 150) return;
      applyUiScale(raw);
      render();
    };
  });
  const survivalFx = document.getElementById('settings-survival-fx') as HTMLInputElement | null;
  const uiAudio = document.getElementById('settings-ui-audio') as HTMLInputElement | null;
  const hudHints = document.getElementById('settings-hud-hints') as HTMLInputElement | null;
  const perfOverlay = document.getElementById('settings-perf-overlay') as HTMLInputElement | null;
  if (survivalFx) {
    survivalFx.onchange = (e) => {
      const checked = (e.currentTarget as HTMLInputElement).checked;
      applySurvivalFx(checked);
    };
  }
  if (uiAudio) {
    uiAudio.onchange = (e) => {
      const checked = (e.currentTarget as HTMLInputElement).checked;
      setUiAudioMuted(!checked);
    };
  }
  if (hudHints) {
    hudHints.onchange = (e) => {
      const checked = (e.currentTarget as HTMLInputElement).checked;
      applyHudHintsVisible(checked);
    };
  }
  if (perfOverlay) {
    perfOverlay.onchange = (e) => {
      const checked = (e.currentTarget as HTMLInputElement).checked;
      setPerfOverlayEnabled(checked);
    };
  }
}

export function mountSettings(container: HTMLElement, nextHost: SettingsHost): void {
  root = container;
  host = nextHost;
  activeTab = getActiveTab();
  applySurvivalFx(isReducedSurvivalFx());
  applyHudHintsVisible(areHudHintsVisible());
  applyChatOpacityMode(getChatOpacityMode());
  applyUiScale(getUiScale());
  window.addEventListener(GRAPHICS_CHANGED_EVENT, render);
  render();
}

export function isSettingsOpen(): boolean {
  return root?.classList.contains('visible') ?? false;
}

export function openSettings(): void {
  if (!root) return;
  render();
  root.classList.add('visible');
}

export function closeSettings(): void {
  if (!root) return;
  root.classList.remove('visible');
  host?.onClose?.();
}

export function toggleSettings(): void {
  if (isSettingsOpen()) closeSettings();
  else openSettings();
}
