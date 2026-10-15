/** Cache-Control for Fastify static `/media` files. Manifest is a separate API route.
 * Paths are not content-hashed; long-lived immutable caching hides regenerations.
 * Clients receive `?v=<generatedAt>` from the manifest for cache busting.
 */

export function mediaStaticCacheControl(filePath: string): string | undefined {
  const n = filePath.replace(/\\/g, '/');
  if (n.includes('/atlases/')) {
    return 'public, max-age=3600, must-revalidate';
  }
  if (/\/assets\/[^/]+\.(webp|ktx|ktx2|pvr)$/i.test(n)) {
    return 'public, max-age=3600, must-revalidate';
  }
  return undefined;
}

export const MEDIA_MANIFEST_CACHE_CONTROL = 'no-store';
