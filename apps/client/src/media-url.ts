/** Append/replace cache-bust query so regenerations refresh without stacking `v=`. */
export function bustMediaUrl(url: string, generatedAt?: string): string {
  const bust = generatedAt && generatedAt.length > 0 ? generatedAt : '0';
  const hashIndex = url.indexOf('#');
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const cleaned = base
    .replace(/([?&])v=[^&]*(&|$)/, (_match, sep: string, end: string) => (end === '&' ? sep : ''))
    .replace(/\?$/, '');
  const joiner = cleaned.includes('?') ? '&' : '?';
  return `${cleaned}${joiner}v=${encodeURIComponent(bust)}${hash}`;
}
