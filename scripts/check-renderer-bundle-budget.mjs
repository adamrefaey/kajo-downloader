#!/usr/bin/env node
/**
 * Fails CI when the built renderer JS payload exceeds a loose budget (catches huge regressions).
 * Run from repo root after `pnpm exec electron-vite build`.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const desktopRoot = join(import.meta.dirname, '..');
const assetsDir = join(desktopRoot, 'out', 'renderer', 'assets');

/** ~18 MiB — adjust when intentional large dependency changes land. */
const MAX_TOTAL_JS_BYTES = 18 * 1024 * 1024;

function main() {
    let names;
    try {
        names = readdirSync(assetsDir);
    } catch {
        console.error(
            '[check-renderer-bundle-budget] Missing desktop/out/renderer/assets — run electron-vite build first.'
        );
        process.exitCode = 1;
        return;
    }
    let total = 0;
    for (const name of names) {
        if (!name.endsWith('.js')) {
            continue;
        }
        total += statSync(join(assetsDir, name)).size;
    }
    const mb = (total / (1024 * 1024)).toFixed(2);
    console.log(`[check-renderer-bundle-budget] Renderer .js total: ${mb} MiB`);
    if (total > MAX_TOTAL_JS_BYTES) {
        console.error(
            `[check-renderer-bundle-budget] Over budget (${mb} MiB > ${MAX_TOTAL_JS_BYTES / (1024 * 1024)} MiB).`
        );
        process.exitCode = 1;
    }
}

main();
