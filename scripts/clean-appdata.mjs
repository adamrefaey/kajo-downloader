#!/usr/bin/env node
/**
 * Wipe local Electron app data for Kajo Downloader (dev + packaged).
 *
 * Profile dirs (align with `electron/lib/appIdentity.ts` + `configureUserDataPaths.ts`):
 * - packaged → `package.json` `name` (e.g. `kajo-downloader`)
 * - unpackaged → `${name}-dev`
 * - display leftover → `productName` (Electron may create an empty folder before setPath)
 *
 * Logs and Chromium session data live under userData, so removing the profile
 * dir is enough. Also clears macOS Preferences / saved state / CrashReporter.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = join(import.meta.dirname, '..');

function readPkgName() {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    if (typeof pkg.name !== 'string' || !pkg.name.trim()) {
        throw new Error('Could not read name from package.json');
    }
    return pkg.name.trim();
}

async function readBuilderIdentity() {
    const { default: config } = await import(
        pathToFileURL(join(projectRoot, 'electron-builder.config.mjs')).href
    );
    if (typeof config.appId !== 'string' || !config.appId.trim()) {
        throw new Error('Could not read appId from electron-builder.config.mjs');
    }
    if (typeof config.productName !== 'string' || !config.productName.trim()) {
        throw new Error('Could not read productName from electron-builder.config.mjs');
    }
    return {
        appId: config.appId.trim(),
        productName: config.productName.trim()
    };
}

/** Roots where Electron may place a named profile directory. */
function profileRoots() {
    const home = homedir();
    if (process.platform === 'darwin') {
        return [join(home, 'Library', 'Application Support')];
    }
    if (process.platform === 'win32') {
        return [
            process.env.APPDATA ?? join(home, 'AppData', 'Roaming'),
            process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
        ];
    }
    return [
        process.env.XDG_CONFIG_HOME ?? join(home, '.config'),
        process.env.XDG_CACHE_HOME ?? join(home, '.cache')
    ];
}

function remove(label, targetPath) {
    if (!existsSync(targetPath)) {
        console.log(`[clean:appdata] ${label}: not found (${targetPath})`);
        return;
    }
    rmSync(targetPath, { recursive: true, force: true });
    console.log(`[clean:appdata] ${label}: removed ${targetPath}`);
}

function removeMacBundleExtras(appId, productName) {
    if (process.platform !== 'darwin') return;
    const home = homedir();
    remove('preferences', join(home, 'Library', 'Preferences', `${appId}.plist`));
    remove('savedState', join(home, 'Library', 'Saved Application State', `${appId}.savedState`));

    const crashDir = join(home, 'Library', 'Application Support', 'CrashReporter');
    if (!existsSync(crashDir)) {
        console.log(`[clean:appdata] crashReporter: not found (${crashDir})`);
        return;
    }
    const prefixes = [productName, productName.replaceAll(/\s+/g, '')];
    let removed = 0;
    for (const entry of readdirSync(crashDir)) {
        if (!prefixes.some((p) => entry === `${p}.plist` || entry.startsWith(`${p}_`))) {
            continue;
        }
        remove(`crashReporter/${entry}`, join(crashDir, entry));
        removed += 1;
    }
    if (removed === 0) {
        console.log(`[clean:appdata] crashReporter: no matching plists (${crashDir})`);
    }
}

const pkgName = readPkgName();
const { appId, productName } = await readBuilderIdentity();
const profileNames = [...new Set([pkgName, `${pkgName}-dev`, productName])];

for (const name of profileNames) {
    for (const root of profileRoots()) {
        remove(name, join(root, name));
    }
}
removeMacBundleExtras(appId, productName);

console.log(`[clean:appdata] done (${profileNames.join(', ')})`);
