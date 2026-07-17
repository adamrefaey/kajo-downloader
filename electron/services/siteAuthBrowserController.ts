/**
 * Embedded site sign-in: one {@link WebContentsView} attached to the main window, using a
 * dedicated persisted session partition per {@link resolveSiteCookieStorageKey}.
 * Navigation chrome lives in the renderer; this module owns native WebContents lifecycle,
 * navigation guardrails, and cookie capture on success.
 *
 * Security posture (high level):
 * - Session isolation: `partition` is per site key; not shared with the main renderer or app OAuth.
 * - Renderer hardening: sandboxed, no Node, no `webviewTag`, `webSecurity` on, no insecure mixed content.
 * - Navigation: HTTPS only; host allowlist via site profile + root host; `will-navigate`,
 *   `will-redirect`, and `setWindowOpenHandler` apply the same checks (no `http:` / `data:` /
 *   `file:` / custom schemes — plaintext is refused so credentialed cookies can't be downgraded).
 * - Permissions: embedded session denies ALL permission requests, permission checks, and device
 *   (WebUSB/Serial/HID) selection; screen capture is denied by default (no display-media handler).
 * - CSP: third-party documents bring their own CSP; we do not inject script into those pages.
 */
import { type BrowserWindow, session, type WebContents, WebContentsView } from 'electron';
import { listAllowedDomainSuffixesForSiteAuth } from '../../src/shared/siteAuthDomains';
import { resolveSiteCookieStorageKey } from '../../src/shared/siteAuthKeys';
import { getSiteProfileByHostOrUrl } from '../../src/shared/siteProfiles';
import { siteAuthSaveAndClose } from './siteAuthCookieCapture';
import { clearSiteCookieSnapshot, unlinkMaterializedSiteCookieJar } from './siteAuthCookieStore';
import { attachNavigationGuards, rootHostFromInitial } from './siteAuthNavigationGuards';
import {
    getActiveSiteAuthSession,
    type SiteAuthBoundsPayload,
    type SiteAuthOpenPayload,
    setActiveSiteAuthSession,
    setLastAttachedSiteAuthView
} from './siteAuthSessionState';
import { detachOrphanedSiteAuthSurface, removeViewFromWindow } from './siteAuthViewLifecycle';

export type { SiteAuthBoundsPayload, SiteAuthOpenPayload };

export function siteAuthPersistPartition(siteKey: string): string {
    return `persist:kajo-siteauth-${siteKey}`;
}

/**
 * Removes encrypted snapshot, materialized cookie jar, and all Chromium data for the
 * site's embedded sign-in partition (cookies, cache, storage, service workers, etc.).
 */
export async function purgeSignedSiteSession(siteKey: string): Promise<void> {
    const key = siteKey.trim();
    if (!key) {
        return;
    }
    if (getActiveSiteAuthSession()?.siteKey === key) {
        closeSiteAuthBrowser();
    }
    const sess = session.fromPartition(siteAuthPersistPartition(key));
    try {
        await sess.clearData();
    } catch (e) {
        console.warn('[kajo] purgeSignedSiteSession: clearData failed', e);
    }
    try {
        await sess.clearAuthCache();
    } catch {
        /* ignore */
    }
    clearSiteCookieSnapshot(key);
    await unlinkMaterializedSiteCookieJar(key);
}

export function closeSiteAuthBrowser(_options?: { emitUserCancelled?: boolean }): void {
    const active = getActiveSiteAuthSession();
    if (!active) {
        detachOrphanedSiteAuthSurface();
        return;
    }
    setActiveSiteAuthSession(null);
    removeViewFromWindow(active);
}

/** Partition key for the embedded sign-in surface, if any (skip background refresh for this site). */
export function getActiveSiteAuthSiteKey(): string | null {
    return getActiveSiteAuthSession()?.siteKey ?? null;
}

export function openSiteAuthBrowser(
    mainWindow: BrowserWindow,
    targetSender: WebContents,
    payload: SiteAuthOpenPayload
): { ok: true; siteKey: string; allowedSuffixes: string[] } | { ok: false; error: string } {
    if (!mainWindow?.webContents || mainWindow.isDestroyed()) {
        return { ok: false, error: 'Main window unavailable' };
    }

    const trimmed = payload.initialUrl.trim();
    if (!trimmed) {
        return { ok: false, error: 'Missing URL' };
    }

    const rootHost = rootHostFromInitial(trimmed);
    if (!rootHost) {
        return { ok: false, error: 'Invalid URL' };
    }

    closeSiteAuthBrowser();

    const profile = getSiteProfileByHostOrUrl(trimmed);
    // Partition/storage key is derived only from the URL → site profile. Ignore renderer
    // siteId/siteDomain unless they match the profile (prevents partition confusion).
    const clientSiteId = payload.siteId?.trim();
    if (clientSiteId && profile?.siteId && clientSiteId !== profile.siteId) {
        return { ok: false, error: 'Site mismatch' };
    }
    const clientDomain = payload.siteDomain?.trim().toLowerCase();
    if (
        clientDomain &&
        profile?.domains?.length &&
        !profile.domains.some((d) => d.toLowerCase() === clientDomain)
    ) {
        return { ok: false, error: 'Site mismatch' };
    }
    const siteKey = resolveSiteCookieStorageKey({
        url: trimmed,
        ...(profile?.siteId !== undefined ? { siteId: profile.siteId } : {})
    });

    const partition = siteAuthPersistPartition(siteKey);

    const view = new WebContentsView({
        webPreferences: {
            partition,
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

    const sess = {
        view,
        siteKey,
        rootHost,
        profile,
        targetSender,
        window: mainWindow
    };

    attachNavigationGuards(sess);

    try {
        const { contentView } = mainWindow;
        if (!contentView || typeof contentView.addChildView !== 'function') {
            view.webContents.close();
            return { ok: false, error: 'Content view does not support embedding' };
        }
        contentView.addChildView(view);
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        setLastAttachedSiteAuthView(view, mainWindow);
    } catch (e) {
        view.webContents.close();
        return {
            ok: false,
            error: e instanceof Error ? e.message : 'Failed to attach browser view'
        };
    }

    setActiveSiteAuthSession(sess);

    const loadUrl = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    void view.webContents.loadURL(loadUrl);

    const allowedSuffixes = listAllowedDomainSuffixesForSiteAuth(profile, rootHost);
    return { ok: true, siteKey, allowedSuffixes };
}

export function setSiteAuthEmbedBounds(bounds: SiteAuthBoundsPayload): boolean {
    const active = getActiveSiteAuthSession();
    if (!active) {
        return false;
    }
    const w = Math.max(0, Math.round(bounds.width));
    const h = Math.max(0, Math.round(bounds.height));
    if (w < 2 || h < 2) {
        return false;
    }
    active.view.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: w,
        height: h
    });
    return true;
}

export function siteAuthGoBack(): boolean {
    const active = getActiveSiteAuthSession();
    if (!active?.view.webContents.navigationHistory.canGoBack()) {
        return false;
    }
    void active.view.webContents.goBack();
    return true;
}

export function siteAuthGoForward(): boolean {
    const active = getActiveSiteAuthSession();
    if (!active?.view.webContents.navigationHistory.canGoForward()) {
        return false;
    }
    void active.view.webContents.goForward();
    return true;
}

export function siteAuthReload(): boolean {
    const active = getActiveSiteAuthSession();
    if (!active) {
        return false;
    }
    active.view.webContents.reload();
    return true;
}

export { siteAuthSaveAndClose };
