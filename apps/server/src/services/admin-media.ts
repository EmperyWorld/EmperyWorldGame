import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSET_IMAGE_EXT,
  MEDIA_CATALOG,
  MEDIA_CATEGORY_DEFINITIONS,
  mediaCategoryForProfile,
  profileInMediaCategory,
  type MediaCategoryId,
} from '@empery/media';

export interface AdminMediaCategoryStatus {
  id: MediaCategoryId;
  total: number;
  ready: number;
  missing: number;
}

export interface AdminMissingMedia {
  id: string;
  label: string;
  profile: string;
  category: Exclude<MediaCategoryId, 'all'>;
  missingFile: boolean;
  missingManifest: boolean;
}

export interface AdminMediaStatus {
  total: number;
  ready: number;
  missing: number;
  categories: AdminMediaCategoryStatus[];
  missingAssets: AdminMissingMedia[];
}

interface MediaManifestShape {
  assets?: Record<string, { url?: string }>;
}

function readManifest(rootDir: string): MediaManifestShape {
  const path = join(rootDir, 'content/media/manifest.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MediaManifestShape;
  } catch {
    return {};
  }
}

export function buildAdminMediaStatus(
  rootDir: string,
  outputDir = join(rootDir, 'data/generated'),
): AdminMediaStatus {
  const manifest = readManifest(rootDir);
  const missingAssets: AdminMissingMedia[] = [];

  for (const spec of MEDIA_CATALOG) {
    const missingFile = !existsSync(join(outputDir, 'assets', `${spec.id}.${ASSET_IMAGE_EXT}`));
    const missingManifest = typeof manifest.assets?.[spec.id]?.url !== 'string';
    if (!missingFile && !missingManifest) continue;
    missingAssets.push({
      id: spec.id,
      label: spec.label,
      profile: spec.profile,
      category: mediaCategoryForProfile(spec.profile),
      missingFile,
      missingManifest,
    });
  }

  const missingIds = new Set(missingAssets.map((asset) => asset.id));
  const categories = MEDIA_CATEGORY_DEFINITIONS.map((definition) => {
    const specs = MEDIA_CATALOG.filter((spec) =>
      profileInMediaCategory(spec.profile, definition.id),
    );
    const missing = specs.reduce(
      (count, spec) => count + (missingIds.has(spec.id) ? 1 : 0),
      0,
    );
    return {
      id: definition.id,
      total: specs.length,
      ready: specs.length - missing,
      missing,
    };
  });

  return {
    total: MEDIA_CATALOG.length,
    ready: MEDIA_CATALOG.length - missingAssets.length,
    missing: missingAssets.length,
    categories,
    missingAssets,
  };
}
