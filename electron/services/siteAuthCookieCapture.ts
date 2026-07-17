import { IPC_MAIN_TO_RENDERER } from '../../src/shared/ipcChannels';
import { listAllowedDomainSuffixesForSiteAuth } from '../../src/shared/siteAuthDomains';
import { captureAndPersistSessionCookies } from './siteAuthCookieStore';
import {
    emitToTarget,
    getActiveSiteAuthSession,
    setActiveSiteAuthSession
} from './siteAuthSessionState';
import { removeViewFromWindow } from './siteAuthViewLifecycle';

export async function siteAuthSaveAndClose(): Promise<
    { ok: true; cookieCount: number; siteKey: string } | { ok: false; error: string }
> {
    const active = getActiveSiteAuthSession();
    if (!active) {
        return { ok: false, error: 'Browser not open' };
    }
    const sess = active;
    const target = sess.targetSender;
    const displayHint = sess.view.webContents.getTitle()?.trim();
    const allowedDomainSuffixes = listAllowedDomainSuffixesForSiteAuth(sess.profile, sess.rootHost);
    try {
        const outcome = await captureAndPersistSessionCookies(
            sess.view.webContents.session,
            sess.siteKey,
            { displayHint, allowedDomainSuffixes }
        );
        if (!outcome.ok) {
            if (outcome.error === 'site_auth_no_session') {
                /* Keep embed + session: user can sign in and press Done again without a blank panel. */
                return { ok: false, error: outcome.error };
            }
            setActiveSiteAuthSession(null);
            removeViewFromWindow(sess);
            if (!target.isDestroyed()) {
                emitToTarget(target, IPC_MAIN_TO_RENDERER.siteAuthCookieRefresh, {
                    siteKey: sess.siteKey,
                    outcome: 'failure',
                    error: outcome.error
                });
            }
            return { ok: false, error: outcome.error };
        }
        const cookieCount = outcome.cookieCount;
        setActiveSiteAuthSession(null);
        removeViewFromWindow(sess);
        if (!target.isDestroyed()) {
            emitToTarget(target, IPC_MAIN_TO_RENDERER.siteAuthCookieRefresh, {
                siteKey: sess.siteKey,
                outcome: 'success',
                cookieCount
            });
        }
        return { ok: true, cookieCount, siteKey: sess.siteKey };
    } catch (e) {
        setActiveSiteAuthSession(null);
        removeViewFromWindow(sess);
        const message = e instanceof Error ? e.message : 'Failed to save cookies';
        if (!target.isDestroyed()) {
            emitToTarget(target, IPC_MAIN_TO_RENDERER.siteAuthCookieRefresh, {
                siteKey: sess.siteKey,
                outcome: 'failure',
                error: message
            });
        }
        return {
            ok: false,
            error: message
        };
    }
}
