import { BrowserWindow } from 'electron';
import { IPC_MAIN_TO_RENDERER } from '../../src/shared/ipcChannels';
import { listAllowedDomainSuffixesForSiteAuth } from '../../src/shared/siteAuthDomains';
import { resolveSiteSessionRefreshSeedUrl } from '../../src/shared/siteAuthRefreshUrls';
import { getSiteProfileBySiteId } from '../../src/shared/siteProfiles';
import type { SiteAuthCookieRefreshPayload } from '../../src/types';
import { safeSend } from '../mainHelpers';
import { mainLog } from '../mainLogger';
import { getActiveSiteAuthSiteKey, siteAuthPersistPartition } from './siteAuthBrowserController';
import {
    captureAndPersistSessionCookies,
    getSignedSiteSummary,
    listSignedSiteStorageKeys
} from './siteAuthCookieStore';
import { attachCredentialedSessionGuards } from './siteAuthNavigationGuards';

/** Keep signed-in partitions warm and re-export cookies for yt-dlp without opening the modal (every 5 minutes). */
export const SIGNED_SITE_SESSION_REFRESH_INTERVAL_MS: number = 5 * 60 * 1000;

const LOAD_TIMEOUT_MS = 45_000;

let cycleRunning = false;

function broadcastCookieRefresh(payload: SiteAuthCookieRefreshPayload): void {
    for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) {
            safeSend(w.webContents, IPC_MAIN_TO_RENDERER.siteAuthCookieRefresh, payload);
        }
    }
}

async function refreshSingleSite(siteKey: string): Promise<void> {
    const summary = getSignedSiteSummary(siteKey);
    const url = resolveSiteSessionRefreshSeedUrl(siteKey, summary?.domainLabel ?? null);
    if (!url) {
        return;
    }
    if (getActiveSiteAuthSiteKey() === siteKey) {
        return;
    }

    const profile = getSiteProfileBySiteId(siteKey);
    let rootHost = '';
    try {
        rootHost = new URL(url).hostname.toLowerCase();
    } catch {
        return;
    }
    const allowedDomainSuffixes = listAllowedDomainSuffixesForSiteAuth(profile, rootHost);
    const displayHint = summary?.signedInAs?.trim() || undefined;

    const win = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        skipTaskbar: true,
        webPreferences: {
            partition: siteAuthPersistPartition(siteKey),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            webviewTag: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            spellcheck: false
        }
    });

    attachCredentialedSessionGuards(win.webContents, { profile, rootHost });

    try {
        const {
            promise: loadPromise,
            resolve: resolveLoad,
            reject: rejectLoad
        } = Promise.withResolvers<void>();
        const timer = setTimeout(() => {
            rejectLoad(new Error('load timeout'));
        }, LOAD_TIMEOUT_MS);
        win.webContents.once('did-finish-load', () => {
            clearTimeout(timer);
            resolveLoad();
        });
        void win.loadURL(url).catch((err) => {
            clearTimeout(timer);
            rejectLoad(err instanceof Error ? err : new Error(String(err)));
        });
        await loadPromise;
        await new Promise<void>((r) => {
            setTimeout(r, 1500);
        });
    } catch (e) {
        console.warn('[kajo] background site session refresh: load failed for', siteKey, e);
        if (!win.isDestroyed()) {
            win.destroy();
        }
        return;
    }

    try {
        const outcome = await captureAndPersistSessionCookies(win.webContents.session, siteKey, {
            allowedDomainSuffixes,
            ...(displayHint !== undefined ? { displayHint } : {})
        });
        if (!outcome.ok) {
            return;
        }
        broadcastCookieRefresh({
            siteKey,
            outcome: 'success',
            cookieCount: outcome.cookieCount
        });
    } catch (err) {
        console.warn('[kajo] background site session refresh: capture failed for', siteKey, err);
    } finally {
        if (!win.isDestroyed()) {
            win.destroy();
        }
    }
}

/**
 * Loads each saved site's sign-in origin in a hidden window (partition cookies), then re-persists the jar.
 * Skips sites without a resolvable URL and the site currently open in the embedded auth browser.
 */
export async function runSignedSiteSessionRefreshCycle(): Promise<void> {
    if (cycleRunning) {
        return;
    }
    cycleRunning = true;
    try {
        const keys = listSignedSiteStorageKeys();
        for (const siteKey of keys) {
            await refreshSingleSite(siteKey);
        }
    } finally {
        cycleRunning = false;
    }
}

export function startSignedSiteSessionBackgroundRefresh(): void {
    const scheduleNext = (): void => {
        const jitter = 1 + (Math.random() * 0.3 - 0.15); // ±15%
        setTimeout(
            () => {
                void runSignedSiteSessionRefreshCycle()
                    .catch((e) => {
                        mainLog.error('[kajo] signed site session refresh cycle', {
                            err: String(e)
                        });
                    })
                    .finally(scheduleNext);
            },
            Math.round(SIGNED_SITE_SESSION_REFRESH_INTERVAL_MS * jitter)
        );
    };
    setTimeout(() => {
        void runSignedSiteSessionRefreshCycle()
            .catch((e) => {
                mainLog.error('[kajo] signed site session refresh cycle', { err: String(e) });
            })
            .finally(scheduleNext);
    }, 60_000);
}
