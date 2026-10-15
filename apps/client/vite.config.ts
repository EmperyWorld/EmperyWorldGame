import { defineConfig } from 'vite';
import { clientAssetCacheControl } from './src/game/client-asset-cache.ts';

/** Один origin: HTTP+WS. target ws:// на рестарте API даёт «handshake closed» + 502. */
const API_ORIGIN = process.env.EMPERY_API_ORIGIN ?? 'http://127.0.0.1:3000';

const proxy = {
  '/api': { target: API_ORIGIN, changeOrigin: true },
  '/ready': { target: API_ORIGIN, changeOrigin: true },
  '/health': { target: API_ORIGIN, changeOrigin: true },
  '/media': { target: API_ORIGIN, changeOrigin: true },
  '/ws': {
    target: API_ORIGIN,
    changeOrigin: true,
    ws: true,
  },
};

function cacheControlPlugin() {
  return {
    name: 'empery-cache-control',
    configurePreviewServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const ctrl = clientAssetCacheControl(req.url ?? '');
        if (ctrl) res.setHeader('Cache-Control', ctrl);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [cacheControlPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5180,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 5180,
    proxy,
  },
  build: {
    outDir: 'dist',
    // Phaser is intentionally isolated as one vendor chunk (~1.37 MB minified).
    // Keep the default warning useful for accidental app-chunk growth without
    // reporting the known engine payload on every production build.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
        },
      },
    },
  },
});
