#!/usr/bin/env node
/**
 * Compares current renderer .js total size to desktop/build/renderer-bundle-baseline.json.
 * Fails CI on large unexpected growth (complements the absolute cap in check-renderer-bundle-budget.mjs).
 *
 * Refresh baseline after intentional dependency or chunk changes:
 *   UPDATE_RENDERER_BUNDLE_BASELINE=1 node scripts/check-renderer-bundle-delta.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const desktopRoot = join(import.meta.dirname, '..');
const assetsDir = join(desktopRoot, 'out', 'renderer', 'assets');
const baselinePath = join(desktopRoot, 'build', 'renderer-bundle-baseline.json');

/** Allow up to this fractional increase over baseline before failing (e.g. 0.12 = +12%). */
const MAX_REGRESSION_RATIO = 0.12;

function sumRendererJsBytes() {
    let names;
    try {
        names = readdirSync(assetsDir);
    } catch {
        return null;
    }
    let total = 0;
    for (const name of names) {
        if (!name.endsWith('.js')) {
            continue;
        }
        total += statSync(join(assetsDir, name)).size;
    }
    return total;
}

function main() {
    const current = sumRendererJsBytes();
    if (current === null) {
        console.error(
            '[check-renderer-bundle-delta] Missing desktop/out/renderer/assets — run electron-vite build first.'
        );
        process.exitCode = 1;
        return;
    }

    if (process.env.UPDATE_RENDERER_BUNDLE_BASELINE === '1') {
        const payload = {
            totalJsBytes: current,
            note: 'Updated by UPDATE_RENDERER_BUNDLE_BASELINE=1; commit with intentional bundle changes.'
        };
        writeFileSync(baselinePath, `${JSON.stringify(payload, null, 4)}\n`, 'utf8');
        console.log(
            `[check-renderer-bundle-delta] Wrote baseline ${current} bytes → ${baselinePath}`
        );
        return;
    }

    let baselineJson;
    try {
        baselineJson = JSON.parse(readFileSync(baselinePath, 'utf8'));
    } catch {
        console.error(`[check-renderer-bundle-delta] Missing or invalid baseline: ${baselinePath}`);
        process.exitCode = 1;
        return;
    }
    const baseline = baselineJson.totalJsBytes;
    if (typeof baseline !== 'number' || baseline <= 0) {
        console.error(
            '[check-renderer-bundle-delta] baseline totalJsBytes must be a positive number'
        );
        process.exitCode = 1;
        return;
    }

    const cap = Math.floor(baseline * (1 + MAX_REGRESSION_RATIO));
    const mb = (current / (1024 * 1024)).toFixed(2);
    console.log(
        `[check-renderer-bundle-delta] Renderer .js total: ${mb} MiB (baseline ${baseline} bytes, cap +${Math.round(MAX_REGRESSION_RATIO * 100)}%)`
    );
    if (current > cap) {
        console.error(
            `[check-renderer-bundle-delta] Bundle grew beyond allowed delta (${current} > ${cap}). Update dependencies or run with UPDATE_RENDERER_BUNDLE_BASELINE=1 and commit the baseline.`
        );
        process.exitCode = 1;
    }
}

main();
