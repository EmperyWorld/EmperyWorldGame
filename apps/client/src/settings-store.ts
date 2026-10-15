export const SETTINGS_STORAGE_KEY = 'empery-settings';
export const SETTINGS_SCHEMA_VERSION = 5;

export const LEGACY_GRAPHICS_STORAGE_KEY = 'empery-graphics';
export const LEGACY_PERF_OVERLAY_STORAGE_KEY = 'empery-perf-overlay';
export const LEGACY_SURVIVAL_FX_STORAGE_KEY = 'empery-survival-fx';
export const LEGACY_HUD_HINTS_STORAGE_KEY = 'empery-hud-hints';
export const LEGACY_UI_AUDIO_MUTED_STORAGE_KEY = 'empery-ui-audio-muted';
export const LEGACY_SETTINGS_TAB_KEY = 'empery-settings-tab';

export type GraphicsQualitySetting = 'high' | 'ultra_sane_90' | 'ultra_sane' | 'balanced' | 'performance';
export type SettingsTabSetting = 'graphics' | 'interface' | 'controls';
export type ChatOpacityModeSetting = 'transparent' | 'semi' | 'opaque';
export type UiScaleSetting = 75 | 100 | 125 | 150;

export interface ClientSettings {
  schemaVersion: number;
  graphicsQuality: GraphicsQualitySetting;
  perfOverlayEnabled: boolean;
  survivalFxReduced: boolean;
  hudHintsVisible: boolean;
  uiAudioMuted: boolean;
  settingsTab: SettingsTabSetting;
  chatOpacityMode: ChatOpacityModeSetting;
  chatCollapsed: boolean;
  uiScale: UiScaleSetting;
}

const DEFAULT_SETTINGS: ClientSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  graphicsQuality: 'balanced',
  perfOverlayEnabled: false,
  survivalFxReduced: false,
  hudHintsVisible: true,
  uiAudioMuted: false,
  settingsTab: 'graphics',
  chatOpacityMode: 'semi',
  chatCollapsed: true,
  uiScale: 100,
};

let cache: ClientSettings | null = null;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isGraphicsQualitySetting(value: unknown): value is GraphicsQualitySetting {
  return (
    value === 'high' ||
    value === 'ultra_sane_90' ||
    value === 'ultra_sane' ||
    value === 'balanced' ||
    value === 'performance'
  );
}

function isSettingsTabSetting(value: unknown): value is SettingsTabSetting {
  return value === 'graphics' || value === 'interface' || value === 'controls';
}

function isChatOpacityModeSetting(value: unknown): value is ChatOpacityModeSetting {
  return value === 'transparent' || value === 'semi' || value === 'opaque';
}

function isUiScaleSetting(value: unknown): value is UiScaleSetting {
  return value === 75 || value === 100 || value === 125 || value === 150;
}

function parseStoredBlob(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readLegacySettings(storage: Storage): Partial<ClientSettings> {
  const legacy: Partial<ClientSettings> = {};
  const graphics = storage.getItem(LEGACY_GRAPHICS_STORAGE_KEY);
  if (isGraphicsQualitySetting(graphics)) legacy.graphicsQuality = graphics;
  legacy.perfOverlayEnabled = storage.getItem(LEGACY_PERF_OVERLAY_STORAGE_KEY) === '1';
  legacy.survivalFxReduced = storage.getItem(LEGACY_SURVIVAL_FX_STORAGE_KEY) === 'reduced';
  legacy.hudHintsVisible = storage.getItem(LEGACY_HUD_HINTS_STORAGE_KEY) !== '0';
  legacy.uiAudioMuted = storage.getItem(LEGACY_UI_AUDIO_MUTED_STORAGE_KEY) === '1';
  const tab = storage.getItem(LEGACY_SETTINGS_TAB_KEY);
  if (isSettingsTabSetting(tab)) legacy.settingsTab = tab;
  return legacy;
}

function normalizeSettings(candidate: unknown): ClientSettings {
  const raw = candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : {};
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    graphicsQuality: isGraphicsQualitySetting(raw.graphicsQuality)
      ? raw.graphicsQuality
      : DEFAULT_SETTINGS.graphicsQuality,
    perfOverlayEnabled:
      typeof raw.perfOverlayEnabled === 'boolean'
        ? raw.perfOverlayEnabled
        : DEFAULT_SETTINGS.perfOverlayEnabled,
    survivalFxReduced:
      typeof raw.survivalFxReduced === 'boolean'
        ? raw.survivalFxReduced
        : DEFAULT_SETTINGS.survivalFxReduced,
    hudHintsVisible:
      typeof raw.hudHintsVisible === 'boolean' ? raw.hudHintsVisible : DEFAULT_SETTINGS.hudHintsVisible,
    uiAudioMuted: typeof raw.uiAudioMuted === 'boolean' ? raw.uiAudioMuted : DEFAULT_SETTINGS.uiAudioMuted,
    settingsTab: isSettingsTabSetting(raw.settingsTab) ? raw.settingsTab : DEFAULT_SETTINGS.settingsTab,
    chatOpacityMode: isChatOpacityModeSetting(raw.chatOpacityMode)
      ? raw.chatOpacityMode
      : DEFAULT_SETTINGS.chatOpacityMode,
    chatCollapsed: typeof raw.chatCollapsed === 'boolean' ? raw.chatCollapsed : DEFAULT_SETTINGS.chatCollapsed,
    uiScale: isUiScaleSetting(raw.uiScale) ? raw.uiScale : DEFAULT_SETTINGS.uiScale,
  };
}

function persist(next: ClientSettings): void {
  cache = next;
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore storage failures */
  }
}

function load(): ClientSettings {
  const storage = safeStorage();
  if (!storage) return { ...DEFAULT_SETTINGS };
  const blob = parseStoredBlob(storage.getItem(SETTINGS_STORAGE_KEY));
  if (blob) {
    const normalized = normalizeSettings(blob);
    const source =
      typeof blob === 'object' && blob ? (blob as Record<string, unknown>).schemaVersion : undefined;
    if (source !== SETTINGS_SCHEMA_VERSION) persist(normalized);
    return normalized;
  }
  const normalized = normalizeSettings(readLegacySettings(storage));
  persist(normalized);
  return normalized;
}

function ensureLoaded(): ClientSettings {
  cache ??= load();
  return cache;
}

export function getClientSettings(): ClientSettings {
  return { ...ensureLoaded() };
}

export function getClientSetting<K extends keyof ClientSettings>(key: K): ClientSettings[K] {
  return ensureLoaded()[key];
}

export function setClientSetting<K extends keyof ClientSettings>(
  key: K,
  value: ClientSettings[K],
): ClientSettings {
  const next = { ...ensureLoaded(), [key]: value, schemaVersion: SETTINGS_SCHEMA_VERSION };
  persist(next);
  return { ...next };
}

export function resetClientSettings(): ClientSettings {
  const next = { ...DEFAULT_SETTINGS };
  persist(next);
  return { ...next };
}

export function resetClientSettingsCacheForTests(): void {
  cache = null;
}
