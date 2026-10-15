/** Register SW only in production preview/build — never during Vite HMR. */

export function registerMediaServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker
    .register('/sw.js')
    .then(() => {
      const storage = navigator.storage;
      if (!storage || typeof storage.persist !== 'function') return;
      void storage.persist().catch(() => {
        /* persist optional */
      });
    })
    .catch(() => {
      /* SW optional */
    });
}
