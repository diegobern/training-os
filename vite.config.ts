import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Training OS',
        short_name: 'Training OS',
        description: 'Your training operating system — log, analyse and progress.',
        theme_color: '#F4F5F7',
        background_color: '#F4F5F7',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Start workout', short_name: 'Workout', url: '/workout' },
          { name: 'History', short_name: 'History', url: '/history' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The two heavyweights — three.js and the Firebase SDK — are pulled
        // out of the precache. Precaching downloads everything up front, so
        // leaving them in meant a first visit fetching about 1.2MB of code
        // that the first screen does not need, on the same connection as the
        // code it does need. They are cached the moment they are actually
        // used instead, by the rule below, and are then available offline
        // exactly as before from the second visit on.
        // The exercise illustrations and the catalogue are deliberately NOT
        // precached. `globPatterns` above sweeps up every svg under public/,
        // which silently took the precache from 622KB to 25.9MB the moment
        // 906 illustrations landed there — a first visit downloading 26MB of
        // pictures the user may never look at.
        globIgnores: [
          '**/LogoTotem3D-*.js',
          '**/index.esm-*.js',
          'exercise-media/**',
          'catalog/**',
        ],
        runtimeCaching: [
          {
            // Illustrations, cached as they are actually viewed and capped.
            // 150 entries is about 50 exercises at three frames each: the
            // current routine, recent exercises and favourites, which is the
            // working set. Beyond that Workbox evicts the least recently
            // used, so the cache cannot grow without bound on a phone.
            urlPattern: ({ url }: { url: URL }) =>
              url.origin === self.location.origin && url.pathname.startsWith('/exercise-media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-media-v1',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The catalogue itself. Immutable for a given version — a change
            // ships as v2 — so there is nothing to revalidate.
            urlPattern: ({ url }: { url: URL }) =>
              url.origin === self.location.origin && url.pathname.startsWith('/catalog/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'catalog-v1',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The animated mark in the tab bar. Deliberately not precached:
            // it is 100KB that the welcome screen does not show, and a first
            // visit on a phone connection should not pay for it. It is cached
            // the first time the tab bar actually draws it, which is once the
            // person is inside the app, and is offline-safe from then on.
            urlPattern: ({ url }: { url: URL }) =>
              url.origin === self.location.origin && url.pathname.startsWith('/brand/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'brand-v1',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.origin === self.location.origin && /\/assets\/.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-chunks-v1',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/modifiers', '@dnd-kit/utilities'],
        },
      },
    },
  },
})
