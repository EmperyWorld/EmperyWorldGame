import {
  fetchMediaJob,
  fetchMediaManifest,
  type MediaManifest,
} from './api.js';
import { bustMediaUrl } from './media-url.js';
import { ensureHudAtlas } from './hud-atlas.js';
import { pickRacePortraitAssetId } from '@empery/shared/race-portrait';

export interface MediaHelpersDeps {
  getManifest: () => MediaManifest;
  setManifest: (m: MediaManifest) => void;
  menuPortraitEl: HTMLImageElement;
  hudPortraitEl: HTMLImageElement;
  menuBg: HTMLElement;
}

export function createMediaHelpers(deps: MediaHelpersDeps) {
  function assetUrl(assetId: string): string | undefined {
    const raw = deps.getManifest().assets[assetId]?.url;
    if (!raw) return undefined;
    const manifest = deps.getManifest();
    return bustMediaUrl(raw, manifest.cacheRevision ?? manifest.generatedAt);
  }

  async function ensureMediaManifest(): Promise<void> {
    deps.setManifest(await fetchMediaManifest());
    applyUiChrome();
    await ensureHudAtlas(deps.getManifest());
  }

  /** Bind ComfyUI chrome assets into CSS custom properties for the DOM shell. */
  function applyUiChrome(): void {
    const root = document.documentElement;
    const corner = assetUrl('ui_ornament_corner');
    const divider = assetUrl('ui_ornament_divider');
    const seal = assetUrl('ui_seal_imperial');
    if (corner) root.style.setProperty('--ui-ornament-corner', `url("${corner}")`);
    if (divider) root.style.setProperty('--ui-ornament-divider', `url("${divider}")`);
    if (seal) root.style.setProperty('--ui-seal', `url("${seal}")`);
    root.classList.toggle('ui-chrome-ready', Boolean(corner || divider || seal));
  }

  function rememberSave(id: string): void {
    localStorage.setItem('empery_last_save_id', id);
  }

  function setPortraitUrl(url: string | undefined, target: 'menu' | 'hud' | 'both' = 'both'): void {
    const apply = (el: HTMLImageElement): void => {
      if (url) {
        el.src = url;
        el.classList.add('visible');
      } else {
        el.classList.remove('visible');
      }
    };
    if (target === 'menu' || target === 'both') apply(deps.menuPortraitEl);
    if (target === 'hud' || target === 'both') apply(deps.hudPortraitEl);
  }

  function setMenuBg(assetId: string | undefined): void {
    const url = assetId ? assetUrl(assetId) : undefined;
    deps.menuBg.style.backgroundImage = url ? `url(${url})` : 'none';
  }

  function hasMediaAsset(assetId: string): boolean {
    return Boolean(deps.getManifest().assets[assetId]?.url);
  }

  function racePortraitUrl(
    raceId: string,
    gender?: string | null,
    fallbackAssetId?: string | null,
    professionId?: string | null,
  ): string | undefined {
    const id = pickRacePortraitAssetId(raceId, gender, hasMediaAsset, fallbackAssetId, professionId);
    return id ? assetUrl(id) : undefined;
  }

  async function pollPortrait(jobId: string): Promise<void> {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const job = await fetchMediaJob(jobId);
      if (job.status === 'done' && job.url) {
        setPortraitUrl(job.url, 'hud');
        return;
      }
      if (job.status === 'failed') return;
    }
  }

  return {
    assetUrl,
    ensureMediaManifest,
    rememberSave,
    setPortraitUrl,
    setMenuBg,
    applyUiChrome,
    hasMediaAsset,
    racePortraitUrl,
    pollPortrait,
  };
}
