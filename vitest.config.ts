import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { reactWithCompiler } from './viteReactWithCompiler';
import { vitestCoverageExclude } from './vitest-coverage-excludes';

/** Mirror electron-vite import suffixes so Vitest does not execute worker/asset modules. */
function electronViteImportSuffixes(): Plugin {
    return {
        name: 'electron-vite-import-suffixes',
        enforce: 'pre',
        resolveId(source) {
            if (source.includes('?modulePath') || source.includes('?asset')) {
                return `\0${source}`;
            }
            return undefined;
        },
        load(id) {
            if (!id.startsWith('\0')) {
                return undefined;
            }
            const source = id.slice(1);
            if (source.includes('?modulePath')) {
                const filePath = source.replace(/\?modulePath.*$/, '');
                return `export default ${JSON.stringify(filePath)};`;
            }
            if (source.includes('?asset')) {
                const filePath = source.replace(/\?asset.*$/, '');
                return `export default ${JSON.stringify(filePath)};`;
            }
            return undefined;
        }
    };
}

export default defineConfig({
    define: {
        /** Renderer analytics logs in the no-IPC path; keep branches testable in CI. */
        'import.meta.env.DEV': true,
        __KAJO_APP_ENV__: JSON.stringify('prod'),
        __KAJO_WEBSITE_URL__: JSON.stringify('https://github.com/adamrefaey/kajo-downloader'),
        __KAJO_WEBSITE_DOMAIN__: JSON.stringify('github.com')
    },
    plugins: [electronViteImportSuffixes(), reactWithCompiler()],
    resolve: {
        alias: {
            '@renderer': resolve(__dirname, 'src/renderer/src'),
            '@resources': resolve(__dirname, 'resources')
        }
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'desktop',
                    globals: true,
                    environment: 'node',
                    setupFiles: [resolve(__dirname, 'tests/setup.ts')],
                    include: [
                        'tests/**/*.test.{ts,tsx}',
                        'src/**/*.test.{ts,tsx}',
                        'electron/**/*.test.ts'
                    ],
                    exclude: [...configDefaults.exclude]
                }
            }
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary'],
            reportsDirectory: './coverage',
            include: [
                /** Explicit Electron allowlist (not a recursive glob) so ipc registration files stay out of coverage. */
                'electron/mainHelpers.ts',
                'electron/preload.ts',
                'electron/preloadApi/**/*.ts',
                'electron/lib/**/*.ts',
                'electron/services/**/*.ts',
                'electron/i18n/**/*.ts',
                'electron/ipc/rateLimiter.ts',
                'electron/ipc/validateIpcPayload.ts',
                'src/main/load-env.ts',
                'src/main/load-env-core.ts',
                'src/shared/**/*.ts',
                'src/store/**/*.ts',
                'src/renderer/src/**/*.{ts,tsx}'
            ],
            exclude: vitestCoverageExclude,
            thresholds: {
                lines: 100,
                branches: 100,
                functions: 100,
                statements: 100
            }
        }
    }
});
