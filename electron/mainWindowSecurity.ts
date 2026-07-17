import type { WebPreferences } from 'electron';

/** Shared hardened defaults for the primary app `BrowserWindow` (Electron security checklist). */
export const SECURE_MAIN_WEB_PREFERENCES_BASE: Pick<
    WebPreferences,
    | 'contextIsolation'
    | 'nodeIntegration'
    | 'sandbox'
    | 'webSecurity'
    | 'allowRunningInsecureContent'
    | 'experimentalFeatures'
> = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false
};
