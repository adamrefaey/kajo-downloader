import type { BrowserWindow, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../electron/services/siteAuthCookieCapture', () => ({
    siteAuthSaveAndClose: vi.fn()
}));
vi.mock('../electron/services/siteAuthCookieStore', () => ({
    clearSiteCookieSnapshot: vi.fn(),
    unlinkMaterializedSiteCookieJar: vi.fn(async () => {})
}));
vi.mock('../electron/services/siteAuthNavigationGuards', () => ({
    attachNavigationGuards: vi.fn(),
    rootHostFromInitial: (url: string) => {
        try {
            const normalized = url.includes('://') ? url : `https://${url}`;
            return new URL(normalized).hostname;
        } catch {
            return null;
        }
    }
}));
vi.mock('../electron/services/siteAuthSessionState', () => ({
    getActiveSiteAuthSession: vi.fn(() => null),
    setActiveSiteAuthSession: vi.fn(),
    setLastAttachedSiteAuthView: vi.fn()
}));
vi.mock('../electron/services/siteAuthViewLifecycle', () => ({
    detachOrphanedSiteAuthSurface: vi.fn(),
    removeViewFromWindow: vi.fn()
}));

import { openSiteAuthBrowser } from '../electron/services/siteAuthBrowserController';

describe('openSiteAuthBrowser partition key guard', () => {
    const mainWindow = {
        webContents: {},
        isDestroyed: () => false
    } as unknown as BrowserWindow;
    const sender = {} as WebContents;

    it('returns Site mismatch when renderer siteId disagrees with URL-derived profile', () => {
        const result = openSiteAuthBrowser(mainWindow, sender, {
            initialUrl: 'https://www.youtube.com',
            siteId: 'tiktok'
        });
        expect(result).toEqual({ ok: false, error: 'Site mismatch' });
    });

    it('returns Site mismatch when renderer siteDomain is not in the profile allowlist', () => {
        const result = openSiteAuthBrowser(mainWindow, sender, {
            initialUrl: 'https://www.youtube.com',
            siteDomain: 'tiktok.com'
        });
        expect(result).toEqual({ ok: false, error: 'Site mismatch' });
    });
});
