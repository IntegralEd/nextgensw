import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds into ../app so the panel app is served at nextgensw.org/app/
// by the root Netlify publish. /app is gitignored — it's a build
// artifact, regenerated on every deploy.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: '../app',
    emptyOutDir: true,
  },
});
