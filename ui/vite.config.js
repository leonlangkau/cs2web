// Vite build for the React Bits "skins" (the two UI redesigns).
//
// Each skin is one ES-module entry (ui/src/skins/<skin>/main.jsx) that Vite
// compiles straight into public/js and public/css, next to the hand-written
// assets, so the existing asset pipeline (scripts/build-assets.cjs -> ?v=hash
// URLs, _headers immutable caching, _routes.json static exclusions) serves the
// bundles unchanged. Nothing about the Cloudflare Pages deploy changes: the
// output is committed, so the dashboard's "no build command" setup still works.
//
// Naming contract (scripts/build-ui.cjs relies on it when cleaning stale output):
//   public/js/ui-<skin>.js           entry (stable name; cache-busted by ?v=)
//   public/js/rb-<chunk>-<hash>.js   lazy chunks (content-hashed, immutable-safe)
//   public/css/ui-<skin>.css         the entry's CSS (component + landing styles)
//   public/fonts/rb-<name>-<hash>.*  any font/image assets a component imports
//
// CSP on the site is `script-src 'self'; style-src 'self'` with no inline
// allowances, so: no inlined data: URIs for fonts (assetsInlineLimit 0), no
// <style> injection (cssCodeSplit emits real files), no eval.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@rb': path.join(here, 'src/reactbits'),
      '@shared': path.join(here, 'src/shared'),
    },
  },
  build: {
    outDir: path.join(here, '..', 'public'),
    emptyOutDir: false,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    modulePreload: { polyfill: true },
    rollupOptions: {
      input: Object.fromEntries(
        ['neon', 'prism']
          .filter((id) => !process.env.UI_SKIN || process.env.UI_SKIN === id)
          .map((id) => [`ui-${id}`, path.join(here, `src/skins/${id}/main.jsx`)])
      ),
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/rb-[name]-[hash].js',
        assetFileNames: (info) => {
          const name = info.names?.[0] || info.name || 'asset';
          if (/\.css$/i.test(name)) return 'css/[name][extname]';
          // Fonts, images, models: all under fonts/ (already static, immutable
          // and edge-served per _routes.json + _headers), with an rb- prefix so
          // scripts/build-ui.cjs can tell them from the hand-placed fonts.
          return 'fonts/rb-[name]-[hash][extname]';
        },
      },
    },
  },
});
