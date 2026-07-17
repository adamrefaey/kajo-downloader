/**
 * UtilityProcess workers import `electron` but do not get a usable `app` singleton
 * (e.g. `app` is undefined, so `app.isPackaged` throws). Main/renderer do. These
 * helpers mirror Electron defaults so shared services resolve paths consistently.
 */

import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { kajoUserDataDirName } from './appIdentity';

export function electronAppIsPackaged(): boolean {
    if (app != null && typeof app.isPackaged === 'boolean') {
        return app.isPackaged;
    }
    if (process.defaultApp === true) {
        return false;
    }
    if (process.defaultApp === false) {
        return true;
    }
    const rp = process.resourcesPath;
    if (typeof rp === 'string' && rp.length > 0) {
        return existsSync(join(rp, 'bin'));
    }
    return false;
}

export function electronUserDataPath(): string {
    if (app != null && typeof app.getPath === 'function') {
        try {
            return app.getPath('userData');
        } catch {
            // app not ready or unavailable
        }
    }
    /** Set by main when forking UtilityProcess workers (same convention as the native messaging host). */
    const fromEnv = process.env.KAJO_USER_DATA?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    const dirName = kajoUserDataDirName(electronAppIsPackaged());
    if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', dirName);
    }
    if (process.platform === 'win32') {
        const base = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
        return join(base, dirName);
    }
    const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
    return join(xdg, dirName);
}

export function electronTempPath(): string {
    if (app != null && typeof app.getPath === 'function') {
        try {
            return app.getPath('temp');
        } catch {
            // fall through
        }
    }
    return tmpdir();
}
