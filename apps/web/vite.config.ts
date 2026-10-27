import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // The default polyfill calls fetch() for <link rel="modulepreload">. Every browser we support
    // preloads natively, and the bundle must contain no network API at all (see scripts/check-web-build.mjs).
    modulePreload: { polyfill: false },
  },
});
