import type { BrowserWindow, WebContents, WebContentsView } from 'electron';
import type { getSiteProfileByHostOrUrl } from '../../src/shared/siteProfiles';
import { safeSend } from '../mainHelpers';

export interface SiteAuthOpenPayload {
    initialUrl: string;
    siteId?: string;
    siteDomain?: string;
}

export interface SiteAuthBoundsPayload {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ActiveSiteAuthSession {
    view: WebContentsView;
    siteKey: string;
    rootHost: string;
    profile: ReturnType<typeof getSiteProfileByHostOrUrl>;
    targetSender: WebContents;
    window: BrowserWindow;
}

let active: ActiveSiteAuthSession | null = null;

/** Tracks the last embedded view so we can detach even if `active` was cleared too early (e.g. overlapping opens). */
let lastAttachedSiteAuthView: WebContentsView | null = null;
let lastAttachedSiteAuthWindow: BrowserWindow | null = null;

export function getActiveSiteAuthSession(): ActiveSiteAuthSession | null {
    return active;
}

export function setActiveSiteAuthSession(sess: ActiveSiteAuthSession | null): void {
    active = sess;
}

export function getLastAttachedSiteAuthView(): WebContentsView | null {
    return lastAttachedSiteAuthView;
}

export function getLastAttachedSiteAuthWindow(): BrowserWindow | null {
    return lastAttachedSiteAuthWindow;
}

export function setLastAttachedSiteAuthView(
    view: WebContentsView | null,
    window: BrowserWindow | null
): void {
    lastAttachedSiteAuthView = view;
    lastAttachedSiteAuthWindow = window;
}

export function clearLastAttachedIfMatches(view: WebContentsView): void {
    if (lastAttachedSiteAuthView === view) {
        lastAttachedSiteAuthView = null;
        lastAttachedSiteAuthWindow = null;
    }
}

export function emitToTarget(wc: WebContents, channel: string, payload: unknown): void {
    safeSend(wc, channel, payload);
}
