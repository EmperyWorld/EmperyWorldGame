import { afterEach, describe, expect, it } from 'vitest';
import {
  LEGACY_GRAPHICS_STORAGE_KEY,
  LEGACY_HUD_HINTS_STORAGE_KEY,
  LEGACY_PERF_OVERLAY_STORAGE_KEY,
  LEGACY_SETTINGS_TAB_KEY,
  LEGACY_SURVIVAL_FX_STORAGE_KEY,
  LEGACY_UI_AUDIO_MUTED_STORAGE_KEY,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  getClientSetting,
  getClientSettings,
  resetClientSettingsCacheForTests,
} from './settings-store.js';

type Globals = {
  localStorage?: Storage;
};

function makeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    get length(): number {
      return map.size;
    },
  };
}

afterEach(() => {
  resetClientSettingsCacheForTests();
});

describe('settings-store', () => {
  it('falls back to defaults without storage', () => {
    const prevStorage = (globalThis as Globals).localStorage;
    try {
      delete (globalThis as Globals).localStorage;
      const settings = getClientSettings();
      expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
      expect(settings.graphicsQuality).toBe('balanced');
      expect(settings.hudHintsVisible).toBe(true);
      expect(settings.uiAudioMuted).toBe(false);
      expect(settings.settingsTab).toBe('graphics');
      expect(settings.chatOpacityMode).toBe('semi');
      expect(settings.chatCollapsed).toBe(true);
      expect(settings.uiScale).toBe(100);
    } finally {
      (globalThis as Globals).localStorage = prevStorage;
    }
  });

  it('migrates legacy keys into unified schema', () => {
    const prevStorage = (globalThis as Globals).localStorage;
    const storage = makeStorage({
      [LEGACY_GRAPHICS_STORAGE_KEY]: 'ultra_sane',
      [LEGACY_PERF_OVERLAY_STORAGE_KEY]: '1',
      [LEGACY_SURVIVAL_FX_STORAGE_KEY]: 'reduced',
      [LEGACY_HUD_HINTS_STORAGE_KEY]: '0',
      [LEGACY_UI_AUDIO_MUTED_STORAGE_KEY]: '1',
      [LEGACY_SETTINGS_TAB_KEY]: 'interface',
    });
    try {
      (globalThis as Globals).localStorage = storage;
      const settings = getClientSettings();
      expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
      expect(settings.graphicsQuality).toBe('ultra_sane');
      expect(settings.perfOverlayEnabled).toBe(true);
      expect(settings.survivalFxReduced).toBe(true);
      expect(settings.hudHintsVisible).toBe(false);
      expect(settings.uiAudioMuted).toBe(true);
      expect(settings.settingsTab).toBe('interface');
      expect(settings.chatOpacityMode).toBe('semi');
      expect(settings.chatCollapsed).toBe(true);
      expect(settings.uiScale).toBe(100);
      const raw = storage.getItem(SETTINGS_STORAGE_KEY);
      expect(raw).toBeTruthy();
    } finally {
      (globalThis as Globals).localStorage = prevStorage;
    }
  });

  it('normalizes invalid stored values to defaults', () => {
    const prevStorage = (globalThis as Globals).localStorage;
    const storage = makeStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        graphicsQuality: 'ultra_hd_9000',
        perfOverlayEnabled: 'yes',
        survivalFxReduced: 'sometimes',
        hudHintsVisible: 123,
        uiAudioMuted: null,
        settingsTab: 'random',
        uiScale: 999,
      }),
    });
    try {
      (globalThis as Globals).localStorage = storage;
      expect(getClientSetting('graphicsQuality')).toBe('balanced');
      expect(getClientSetting('perfOverlayEnabled')).toBe(false);
      expect(getClientSetting('survivalFxReduced')).toBe(false);
      expect(getClientSetting('hudHintsVisible')).toBe(true);
      expect(getClientSetting('uiAudioMuted')).toBe(false);
      expect(getClientSetting('settingsTab')).toBe('graphics');
      expect(getClientSetting('chatOpacityMode')).toBe('semi');
      expect(getClientSetting('chatCollapsed')).toBe(true);
      expect(getClientSetting('uiScale')).toBe(100);
      const raw = storage.getItem(SETTINGS_STORAGE_KEY);
      expect(raw).toContain(`"schemaVersion":${SETTINGS_SCHEMA_VERSION}`);
    } finally {
      (globalThis as Globals).localStorage = prevStorage;
    }
  });
});
