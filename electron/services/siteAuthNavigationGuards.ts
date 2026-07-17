import type { WebContents } from 'electron';
import { IPC_MAIN_TO_RENDERER } from '../../src/shared/ipcChannels';
import { isHostnameAllowedForSiteAuthSession } from '../../src/shared/siteAuthDomains';
import type { SiteProfile } from '../../src/shared/siteProfiles';
import { safeSend } from '../mainHelpers';
import type { ActiveSiteAuthSession } from './siteAuthSessionState';

export function parseUrlHostname(raw: string): string {
    try {
        const u = new URL(raw.trim());
        return u.hostname.toLowerCase();
    } catch {
        return '';
    }
}

export function rootHostFromInitial(initialUrl: string): string {
    return parseUrlHostname(initialUrl.includes('://') ? initialUrl : `https://${initialUrl}`);
}

export function isNavigationAllowed(
    urlStr: string,
    session: Pick<ActiveSiteAuthSession, 'profile' | 'rootHost'>
): boolean {
    let hostname = '';
    try {
        const u = new URL(urlStr);
        // HTTPS only — this session carries logged-in cookies; never navigate it over plaintext
        // http: (downgrade / cookie-theft on hostile networks). HSTS upgrades real sites anyway.
        if (u.protocol !== 'https:') {
            return false;
        }
        hostname = u.hostname.toLowerCase();
    } catch {
        return false;
    }
    return isHostnameAllowedForSiteAuthSession(hostname, session.profile, session.rootHost);
}

export function emitSiteAuthUrlState(sess: ActiveSiteAuthSession): void {
    const { webContents } = sess.view;
    if (sess.targetSender.isDestroyed()) {
        return;
    }
    safeSend(sess.targetSender, IPC_MAIN_TO_RENDERER.siteAuthUrlState, {
        url: webContents.getURL(),
        canGoBack: webContents.navigationHistory.canGoBack(),
        canGoForward: webContents.navigationHistory.canGoForward(),
        title: webContents.getTitle()
    });
}

type NavGuardSession = {
    profile: SiteProfile | undefined;
    rootHost: string;
};

/**
 * Navigation + permission hardening for a credentialed site-auth webContents (embedded modal or
 * hidden background refresh). Optional `onBlocked` notifies the renderer when a nav is denied.
 */
export function attachCredentialedSessionGuards(
    webContents: WebContents,
    sessionLike: NavGuardSession,
    onBlocked?: (url: string) => void
): void {
    const { session } = webContents;
    // Deny everything on this credentialed session: permission *requests* (camera/mic/geo/
    // notifications/openExternal/…), synchronous permission *checks* (which bypass the request
    // handler), and device (WebUSB/Serial/HID) selection. Screen capture is denied by default
    // because no setDisplayMediaRequestHandler is registered. Sign-in only needs cookies/storage,
    // which these handlers do not touch.
    session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.setDevicePermissionHandler(() => false);

    const deny = (url: string): void => {
        onBlocked?.(url);
    };

    webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
        if (!isMainFrame) {
            return;
        }
        if (!isNavigationAllowed(url, sessionLike)) {
            event.preventDefault();
            deny(url);
        }
    });

    webContents.on('will-navigate', (event, url) => {
        if (!isNavigationAllowed(url, sessionLike)) {
            event.preventDefault();
            deny(url);
        }
    });

    webContents.setWindowOpenHandler((details) => {
        if (isNavigationAllowed(details.url, sessionLike)) {
            void webContents.loadURL(details.url);
        } else {
            deny(details.url);
        }
        return { action: 'deny' };
    });
}

export function attachNavigationGuards(sess: ActiveSiteAuthSession): void {
    const { webContents } = sess.view;

    attachCredentialedSessionGuards(webContents, sess, (url) => {
        if (!sess.targetSender.isDestroyed()) {
            safeSend(sess.targetSender, IPC_MAIN_TO_RENDERER.siteAuthNavBlocked, { url });
        }
    });

    webContents.on('did-start-loading', () => {
        if (sess.targetSender.isDestroyed()) {
            return;
        }
        safeSend(sess.targetSender, IPC_MAIN_TO_RENDERER.siteAuthLoading, { loading: true });
    });

    webContents.on('did-stop-loading', () => {
        if (sess.targetSender.isDestroyed()) {
            return;
        }
        safeSend(sess.targetSender, IPC_MAIN_TO_RENDERER.siteAuthLoading, { loading: false });
        emitSiteAuthUrlState(sess);
    });

    webContents.on('did-navigate', () => emitSiteAuthUrlState(sess));
    webContents.on('did-navigate-in-page', () => emitSiteAuthUrlState(sess));

    webContents.on('did-fail-load', () => {
        if (sess.targetSender.isDestroyed()) {
            return;
        }
        safeSend(sess.targetSender, IPC_MAIN_TO_RENDERER.siteAuthLoading, { loading: false });
        emitSiteAuthUrlState(sess);
    });
}
