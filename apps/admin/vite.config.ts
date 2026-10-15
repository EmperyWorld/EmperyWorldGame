import { defineConfig } from 'vite';

const proxy = {
  '/api': 'http://127.0.0.1:3000',
  '/health': 'http://127.0.0.1:3000',
};

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5190,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 5190,
    proxy,
  },
  build: {
    outDir: 'dist',
  },
});
