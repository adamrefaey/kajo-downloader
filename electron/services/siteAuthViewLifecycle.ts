import type { BrowserWindow, View, WebContentsView } from 'electron';
import {
    type ActiveSiteAuthSession,
    clearLastAttachedIfMatches,
    getLastAttachedSiteAuthView,
    getLastAttachedSiteAuthWindow,
    setLastAttachedSiteAuthView
} from './siteAuthSessionState';

function removeViewFromHierarchy(root: View, target: View): boolean {
    for (const ch of root.children) {
        if (ch === target) {
            root.removeChildView(target);
            return true;
        }
    }
    for (const ch of root.children) {
        if (removeViewFromHierarchy(ch, target)) {
            return true;
        }
    }
    return false;
}

export function detachSiteAuthWebView(window: BrowserWindow, view: WebContentsView): void {
    try {
        view.setVisible(false);
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    } catch {
        /* ignore */
    }
    try {
        const root = window.contentView;
        if (root) {
            root.removeChildView(view);
            removeViewFromHierarchy(root, view);
        }
    } catch {
        /* ignore */
    }
    try {
        view.webContents.close();
    } catch {
        /* ignore */
    }
}

export function detachOrphanedSiteAuthSurface(): void {
    const lastView = getLastAttachedSiteAuthView();
    const lastWindow = getLastAttachedSiteAuthWindow();
    if (!lastView || !lastWindow || lastWindow.isDestroyed()) {
        setLastAttachedSiteAuthView(null, null);
        return;
    }
    detachSiteAuthWebView(lastWindow, lastView);
    setLastAttachedSiteAuthView(null, null);
}

export function removeViewFromWindow(sess: ActiveSiteAuthSession): void {
    const { view, window } = sess;
    detachSiteAuthWebView(window, view);
    clearLastAttachedIfMatches(view);
}
