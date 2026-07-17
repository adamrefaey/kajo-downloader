import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ElectronViteConfigExport } from 'electron-vite';
import { defineConfig } from 'electron-vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { loadEnv } from 'vite';
import { reactWithCompiler } from './viteReactWithCompiler';

/** Keep dev watcher light and block accidental file access from the renderer dev server. */
const devPathsToIgnore = [
    '**/coverage/**',
    '**/tests/**',
    '**/release/**',
    '**/.turbo/**',
    '**/.cursor/**',
    '**/resources/.tmp/**',
    '**/resources/.cache/**',
    '**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '**/__tests__/**',
    '**/__mocks__/**'
];

/**
 * Picomatch patterns relative to project root — Vite must not serve these during dev/preview.
 * Production bundles only include reachable imports; this mainly guards dev + tooling.
 */
const serverFsDenyPatterns = [
    'coverage/**',
    'tests/**',
    'release/**',
    '.turbo/**',
    '.cursor/**',
    'resources/.tmp/**',
    'resources/.cache/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '.github/**',
    'docs/**'
];

/**
 * `dev` enables local dev conveniences in main. Production builds always embed `prod`.
 * Non-production builds default to `dev` so `electron-vite dev` is consistent without
 * setting `KAJO_APP_ENV`. Set `KAJO_APP_ENV=prod` (env or `.env`) to test prod behavior locally.
 */
function resolveKajoAppEnv(mode: string): 'dev' | 'prod' {
    if (mode === 'production') {
        return 'prod';
    }
    const fileEnv = loadEnv(mode, process.cwd(), '');
    const explicit = process.env.KAJO_APP_ENV ?? fileEnv.KAJO_APP_ENV;
    if (explicit != null && String(explicit).trim() !== '') {
        return String(explicit).trim().toLowerCase() === 'dev' ? 'dev' : 'prod';
    }
    return 'dev';
}

/**
 * Public marketing website URL — source of truth for the product domain and any
 * derived strings (support email, openExternal allowlist hostname, checkout redirect
 * origin on the website). Configurable per deployment via `KAJO_WEBSITE_URL`
 * (env or .env). Falls back to the production default.
 *
 * The value is normalized to `https://<host>[/path]` with no trailing slash. The
 * host is extracted and re-exposed as `__KAJO_WEBSITE_DOMAIN__` so downstream
 * code can derive e.g. `support@<domain>` without re-parsing the URL.
 */
function resolveKajoWebsiteUrl(mode: string): { url: string; domain: string } {
    const fileEnv = loadEnv(mode, process.cwd(), '');
    const raw =
        (process.env.KAJO_WEBSITE_URL ?? fileEnv.KAJO_WEBSITE_URL ?? '').trim() ||
        'https://github.com/adamrefaey/kajo-downloader';
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error(
            `KAJO_WEBSITE_URL is not a valid URL (got "${raw}"). Expected e.g. https://github.com/adamrefaey/kajo-downloader.`
        );
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`KAJO_WEBSITE_URL must use https: (got "${parsed.protocol}" in "${raw}").`);
    }
    const normalizedUrl = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
    return { url: normalizedUrl, domain: parsed.hostname.toLowerCase() };
}

// Resolved at module load (top-level await) so the renderer config holds plain plugin
// objects — electron-vite deep-clones the config before awaiting plugins and throws on a
// Promise. Keeping `defineConfig` synchronous preserves its config-type inference.
const rendererReactPlugins = await reactWithCompiler();

const _electronViteConfig: ElectronViteConfigExport = defineConfig(({ mode }) => {
    const kajoAppEnv = resolveKajoAppEnv(mode);
    const kajoAppEnvLiteral = JSON.stringify(kajoAppEnv);
    const { url: kajoWebsiteUrl, domain: kajoWebsiteDomain } = resolveKajoWebsiteUrl(mode);
    const kajoWebsiteUrlLiteral = JSON.stringify(kajoWebsiteUrl);
    const kajoWebsiteDomainLiteral = JSON.stringify(kajoWebsiteDomain);
    const bundleStatsDir = resolve('dist/bundle-stats');
    if (process.env.ANALYZE === '1') {
        mkdirSync(bundleStatsDir, { recursive: true });
    }

    const serverDev = {
        watch: { ignored: devPathsToIgnore },
        fs: { deny: serverFsDenyPatterns }
    };

    return {
        main: {
            define: {
                __KAJO_APP_ENV__: kajoAppEnvLiteral,
                __KAJO_WEBSITE_URL__: kajoWebsiteUrlLiteral,
                __KAJO_WEBSITE_DOMAIN__: kajoWebsiteDomainLiteral
            },
            // Main builds as SSR; bundle all deps except Electron runtime modules.
            ssr: {
                noExternal: true,
                external: ['electron', 'electron-updater']
            },
            build: {
                // Disable automatic dep externalization (only reads production dependencies).
                // Bundle all main-process code; keep electron + electron-updater external.
                externalizeDeps: false,
                minify: 'esbuild',
                rolldownOptions: {
                    input: {
                        index: resolve('electron/main.ts')
                    },
                    output: {
                        // electron-vite validates output.format at configResolved; Vite 8 reads
                        // rolldownOptions (rollupOptions is a deprecated alias) so keep this explicit.
                        format: 'cjs',
                        // Flatten shared chunks beside index.js so __dirname in dynamic imports resolves
                        // to out/main/ (default "chunks/[name]-[hash].js" nests them one level deeper).
                        chunkFileNames: '[name]-[hash].js'
                    }
                }
            },
            server: serverDev
        },
        preload: {
            define: {
                __KAJO_APP_ENV__: kajoAppEnvLiteral,
                __KAJO_WEBSITE_URL__: kajoWebsiteUrlLiteral,
                __KAJO_WEBSITE_DOMAIN__: kajoWebsiteDomainLiteral
            },
            build: {
                // Full bundle required for Electron sandboxed preload — see electron-vite docs.
                externalizeDeps: false,
                rolldownOptions: {
                    output: {
                        format: 'cjs'
                    }
                }
            },
            server: serverDev
        },
        renderer: {
            resolve: {
                alias: {
                    '@renderer': resolve('src/renderer/src'),
                    '@resources': resolve('resources')
                }
            },
            define: {
                __KAJO_APP_ENV__: kajoAppEnvLiteral,
                __KAJO_WEBSITE_URL__: kajoWebsiteUrlLiteral,
                __KAJO_WEBSITE_DOMAIN__: kajoWebsiteDomainLiteral
            },
            plugins: [
                ...rendererReactPlugins,
                ...(process.env.ANALYZE === '1'
                    ? [
                          visualizer({
                              filename: resolve(bundleStatsDir, 'renderer.html'),
                              gzipSize: true,
                              template: 'treemap',
                              open: false
                          })
                      ]
                    : [])
            ],
            server: serverDev,
            build: {
                // Avoid copying a root-level `public/` into renderer output if present; assets use explicit imports.
                copyPublicDir: false,
                // Disable module preload hints: in Electron there is no network latency for
                // local file:// resources, so preload link tags add zero benefit and only
                // increase the HTML document size.
                modulePreload: false,
                cssMinify: 'lightningcss',
                // electron-vite's renderer validator reads build.rollupOptions.input; Vite 8
                // aliases rollupOptions → rolldownOptions, so keep this key for compatibility.
                rollupOptions: {
                    input: resolve('src/renderer/index.html'),
                    output: {
                        /**
                         * Vendor chunk hints for predictable cache-busting.
                         * Only stable `node_modules` paths are matched here — these rarely
                         * change across app-code deployments, giving users better caching.
                         *
                         * Source-level chunks (SettingsModal, SiteAuthBrowserModal,
                         * AI/transcript components, etc.) are derived automatically by Rollup
                         * from explicit `React.lazy(() => import(...))` calls at the usage
                         * site. Maintaining manual path-pattern heuristics for source files
                         * is fragile and duplicates information already encoded in the imports.
                         */
                        manualChunks(id) {
                            const normalized = id.replace(/\\/g, '/');
                            // Vendor — stable node_modules paths
                            if (normalized.includes('/node_modules/react-dom/')) {
                                return 'vendor';
                            }
                            if (normalized.includes('/node_modules/react/')) {
                                return 'vendor';
                            }
                            if (normalized.includes('/node_modules/zustand/')) {
                                return 'state';
                            }
                            if (
                                normalized.includes('/node_modules/i18next/') ||
                                normalized.includes('/node_modules/react-i18next/')
                            ) {
                                return 'i18n';
                            }
                            if (normalized.includes('/node_modules/@tanstack/react-virtual/')) {
                                return 'virtual';
                            }
                            return undefined;
                        }
                    }
                }
            }
        }
    };
});
export default _electronViteConfig;
