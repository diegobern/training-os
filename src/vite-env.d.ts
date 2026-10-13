/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string
/** Content fingerprint of each published catalog file, e.g. `{ 'v2/instructions': 'a1b2c3d4e5f6' }`. Set by vite.config.ts. */
declare const __CATALOG_REVISIONS__: Record<string, string>
