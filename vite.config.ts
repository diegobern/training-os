import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * A fingerprint of every published catalog file, keyed `v2/instructions` and
 * so on. See `loadFile` in src/lib/catalog/store.ts for why it exists: the
 * app keeps each file in IndexedDB and the service worker serves /catalog/
 * CacheFirst, so a file whose content changes without a new catalog version —
 * the Spanish instructions being filled in — would otherwise never reach a
 * phone that had already opened it once.
 */
function catalogRevisions(): Record<string, string> {
  const dir = fileURLToPath(new URL('./public/catalog/', import.meta.url))
  const out: Record<string, string> = {}
  for (const version of readdirSync(dir).filter((d) => /^v\d+$/.test(d))) {
    for (const file of readdirSync(dir + version).filter((f) => f.endsWith('.json'))) {
      const hash = createHash('sha256').update(readFileSync(`${dir}${version}/${file}`)).digest('hex')
      out[`${version}/${file.replace(/\.json$/, '')}`] = hash.slice(0, 12)
    }
  }
  return out
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    __CATALOG_REVISIONS__: JSON.stringify(catalogRevisions()),
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
          // El puente de Capacitor. En el navegador no se pide nunca —
          // `isNativeAndroid()` devuelve false y el import dinámico no llega a
          // ejecutarse — así que precacharlo sería descargar en cada primera
          // visita un código que esa visita no puede usar. Dentro del APK no
          // hace falta caché de ningún tipo: el fichero está en el paquete.
          '**/native-*.js',
          // Las dos páginas legales. Se sirven desde el mismo dominio porque
          // Google Play exige que sean públicas y accesibles sin instalar la
          // app, pero no forman parte de la aplicación: precacharlas serían
          // 17KB en la primera visita de todo el mundo para un texto que casi
          // nadie abre, y además una copia cacheada de una política de
          // privacidad puede quedarse desactualizada, que es justo lo que no
          // interesa en un documento legal.
          'privacy.html',
          'account-deletion.html',
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
            // The mark in the tab bar. Deliberately not precached: it is
            // 174KB that the welcome screen does not show, and a first visit
            // on a phone connection should not pay for it. It is cached the
            // first time the tab bar actually draws it — once the person is
            // inside the app — and is offline-safe from then on.
            //
            // CacheFirst is only safe because the filenames carry a hash of
            // their contents (see e2e/bake-nav-sprite.mjs). They did not once,
            // and a phone kept serving the old strip to a new stylesheet for
            // months; the mark rendered as a column of stripes and nothing
            // errored. The cache name is bumped so those stale copies go.
            urlPattern: ({ url }: { url: URL }) =>
              url.origin === self.location.origin && url.pathname.startsWith('/brand/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'brand-v2',
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
        /*
         * Los trozos de Capacitor se llaman `native-*.js`, vengan de donde
         * vengan. No es cosmética: es lo que permite dejarlos fuera del
         * precaché del service worker (ver `globIgnores` arriba) sin tener
         * que adivinar nombres. Por defecto salían como `web-*.js` e
         * `index-*.js`, indistinguibles del resto.
         *
         * Se hace renombrando el trozo y NO con `manualChunks`. Forzar un
         * `manualChunks: { native: [...] }` parecía lo natural, pero Rollup
         * metía ahí dentro el ayudante de precarga de Vite, y con eso el
         * trozo pasaba a ser una dependencia ESTÁTICA del bundle principal:
         * todos los navegadores descargaban y ejecutaban Capacitor en cada
         * visita, que es exactamente lo contrario de lo que se pretendía.
         * Lo detectó `e2e/android-shell.mjs`.
         */
        chunkFileNames(chunk) {
          // `moduleIds` y no `modules`: en el momento en que Rollup decide el
          // nombre del fichero, el trozo todavía no está renderizado y
          // `modules` no existe.
          const fromCapacitor = (chunk.moduleIds ?? []).some((id) =>
            id.includes('node_modules/@capacitor/'),
          )
          return fromCapacitor ? 'assets/native-[hash].js' : 'assets/[name]-[hash].js'
        },
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/modifiers', '@dnd-kit/utilities'],
        },
      },
    },
  },
})
