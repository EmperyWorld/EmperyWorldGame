/** Preview/build Cache-Control for hashed JS and map JSON. */

export function clientAssetCacheControl(urlPath: string): string | undefined {
  const p = urlPath.split('?')[0] ?? urlPath;
  if (p.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  if (p.startsWith('/maps/')) {
    return 'public, max-age=3600';
  }
  return undefined;
}
