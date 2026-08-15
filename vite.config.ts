import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
      // Edge functions run on Deno and import npm packages with the npm:
      // specifier. The tests run on Node, which does not understand it, so the
      // same source can be exercised here by pointing the specifier at the
      // installed package. Keep these in step with the imports in
      // supabase/functions/_shared/.
      'npm:jsqr@1.4.0': 'jsqr',
      'npm:jpeg-js@0.4.4': 'jpeg-js',
    },
  },
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', emptyOutDir: false },
});
