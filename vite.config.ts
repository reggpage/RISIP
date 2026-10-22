import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The RISIP stack is self-hosted: the API lives next to the app on the same
// host, so the browser talks to `/api` instead of a Supabase project.
//
// In development and in `vite preview` the app is served from localhost, so
// `/api` has to be forwarded to the server. `changeOrigin` rewrites the Host
// header, which is what the server's virtual host requires.
const API_TARGET = process.env.RISIP_API_TARGET ?? 'http://68.65.123.61';
const API_HOST = process.env.RISIP_API_HOST ?? 'risip.online';

const apiProxy = {
  '/api': {
    target: API_TARGET,
    // The server picks its virtual host from the Host header, so the request
    // has to arrive as if it came from the site's own domain. `changeOrigin`
    // is deliberately off: it would rewrite Host to the target's address.
    headers: { host: API_HOST },
    secure: false,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
      // The app talks to the self-hosted API through a small fetch-based
      // client that keeps supabase-js's call shape. Aliasing it here swaps the
      // implementation at bundle time; TypeScript still resolves the real
      // package for types, so the app keeps its typed database calls.
      '@supabase/supabase-js': fileURLToPath(new URL('../risip-shim/src/index.ts', import.meta.url)),
      // Edge functions run on Deno and import npm packages with the npm:
      // specifier. The tests run on Node, which does not understand it, so the
      // same source can be exercised here by pointing the specifier at the
      // installed package. Keep these in step with the imports in
      // supabase/functions/_shared/.
      'npm:jsqr@1.4.0': 'jsqr',
      'npm:jpeg-js@0.4.4': 'jpeg-js',
    },
  },
  server: {
    host: true,
    port: 5173,
    // The shim lives outside the app root, so Vite has to be allowed to read it.
    fs: { allow: ['..'] },
    proxy: apiProxy,
  },
  preview: {
    host: true,
    port: 4173,
    proxy: apiProxy,
  },
  build: { outDir: 'dist', emptyOutDir: false },
});
