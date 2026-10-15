/** Append `?v=` revision to media URLs so regenerations bypass SW/browser immutable caches. */

function withVersion(url: string, revision: string): string {
  if (!url || !revision) return url;
  const hashIndex = url.indexOf('#');
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const cleaned = base.replace(/([?&])v=[^&]*(&|$)/, (_, sep: string, end: string) =>
    end === '&' ? sep : '',
  ).replace(/\?$/, '');
  const joiner = cleaned.includes('?') ? '&' : '?';
  return `${cleaned}${joiner}v=${encodeURIComponent(revision)}${hash}`;
}

function revisionFromManifest(manifest: Record<string, unknown>): string {
  const generatedAt = typeof manifest.generatedAt === 'string' ? manifest.generatedAt : '';
  const ms = Date.parse(generatedAt);
  if (Number.isFinite(ms)) return String(ms);
  return generatedAt || String(Date.now());
}

function bustAtlasRef(ref: Record<string, unknown>, revision: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...ref };
  for (const key of ['image', 'json', 'pack'] as const) {
    const value = next[key];
    if (typeof value === 'string') next[key] = withVersion(value, revision);
  }
  const compressed = next.compressed;
  if (compressed && typeof compressed === 'object' && !Array.isArray(compressed)) {
    const out: Record<string, string> = {};
    for (const [fmt, url] of Object.entries(compressed as Record<string, unknown>)) {
      if (typeof url === 'string') out[fmt] = withVersion(url, revision);
    }
    next.compressed = out;
  }
  return next;
}

export function applyMediaCacheBust(manifest: Record<string, unknown>): Record<string, unknown> {
  const revision = revisionFromManifest(manifest);
  const assetsIn = manifest.assets;
  const assets: Record<string, unknown> = {};
  if (assetsIn && typeof assetsIn === 'object' && !Array.isArray(assetsIn)) {
    for (const [id, entry] of Object.entries(assetsIn as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        assets[id] = entry;
        continue;
      }
      const row = { ...(entry as Record<string, unknown>) };
      if (typeof row.url === 'string') row.url = withVersion(row.url, revision);
      assets[id] = row;
    }
  }

  const atlasesIn = manifest.atlases;
  let atlases: Record<string, unknown> | undefined;
  if (atlasesIn && typeof atlasesIn === 'object' && !Array.isArray(atlasesIn)) {
    atlases = {};
    const source = atlasesIn as Record<string, unknown>;
    if (source.hud && typeof source.hud === 'object' && !Array.isArray(source.hud)) {
      atlases.hud = bustAtlasRef(source.hud as Record<string, unknown>, revision);
    }
    if (source.world && typeof source.world === 'object' && !Array.isArray(source.world)) {
      const world: Record<string, unknown> = {};
      for (const [loc, ref] of Object.entries(source.world as Record<string, unknown>)) {
        if (ref && typeof ref === 'object' && !Array.isArray(ref)) {
          world[loc] = bustAtlasRef(ref as Record<string, unknown>, revision);
        } else {
          world[loc] = ref;
        }
      }
      atlases.world = world;
    }
  }

  return {
    ...manifest,
    assets,
    ...(atlases ? { atlases } : {}),
    cacheRevision: revision,
  };
}
