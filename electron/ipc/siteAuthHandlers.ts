import { ipcMain } from 'electron';
import { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from '../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, type IpcFailureEnvelope, ipcFail } from '../../src/shared/ipcErrors';
import {
    embedBoundsSchema,
    nonEmptyTrimmedStringSchema,
    siteAuthOpenPayloadSchema
} from '../../src/shared/ipcPayloadSchemas';
import { translateMainError } from '../i18n/mainI18n';
import { safeSend } from '../mainHelpers';
import { tryConsumeIpcRateLimitSlot } from './rateLimiter';
import type { IpcHandlerDeps } from './types';
import { parseIpcPayload, withValidSender } from './validateIpcPayload';

export function registerSiteAuthHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.siteAuthOpen,
        withValidSender(deps, async (event, rawPayload: unknown) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.siteAuthOpen)) {
                return { ok: false as const, error: 'rate_limited' };
            }
            const mainWindow = deps.getMainWindow();
            if (!mainWindow || mainWindow.isDestroyed()) {
                return { ok: false as const, error: 'Window unavailable' };
            }
            const p = parseIpcPayload(siteAuthOpenPayloadSchema, rawPayload);
            if (!p) {
                return { ok: false as const, error: 'Invalid payload' };
            }
            const { openSiteAuthBrowser } = await import('../services/siteAuthBrowserController');
            return openSiteAuthBrowser(mainWindow, event.sender, {
                initialUrl: p.initialUrl,
                ...(p.siteId !== undefined ? { siteId: p.siteId } : {}),
                ...(p.siteDomain !== undefined ? { siteDomain: p.siteDomain } : {})
            });
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthClose,
        withValidSender(deps, async (_event): Promise<boolean | IpcFailureEnvelope> => {
            const { closeSiteAuthBrowser } = await import('../services/siteAuthBrowserController');
            closeSiteAuthBrowser({ emitUserCancelled: true });
            return true;
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthSetBounds,
        withValidSender(
            deps,
            async (_event, rawBounds: unknown): Promise<boolean | IpcFailureEnvelope> => {
                const b = parseIpcPayload(embedBoundsSchema, rawBounds);
                if (!b) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const { setSiteAuthEmbedBounds } = await import(
                    '../services/siteAuthBrowserController'
                );
                return setSiteAuthEmbedBounds(b);
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthGoBack,
        withValidSender(deps, async (_event): Promise<boolean | IpcFailureEnvelope> => {
            const { siteAuthGoBack } = await import('../services/siteAuthBrowserController');
            return siteAuthGoBack();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthGoForward,
        withValidSender(deps, async (_event): Promise<boolean | IpcFailureEnvelope> => {
            const { siteAuthGoForward } = await import('../services/siteAuthBrowserController');
            return siteAuthGoForward();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthReload,
        withValidSender(deps, async (_event): Promise<boolean | IpcFailureEnvelope> => {
            const { siteAuthReload } = await import('../services/siteAuthBrowserController');
            return siteAuthReload();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthSave,
        withValidSender(deps, async (_event) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.siteAuthSave)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            const { siteAuthSaveAndClose } = await import('../services/siteAuthBrowserController');
            return siteAuthSaveAndClose();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthListSignedSites,
        withValidSender(deps, async (_event) => {
            const { listSignedSiteSummaries } = await import('../services/siteAuthCookieStore');
            return listSignedSiteSummaries();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthValidateSignedSite,
        withValidSender(deps, async (_event, rawSiteKey: unknown) => {
            const siteKey = parseIpcPayload(nonEmptyTrimmedStringSchema, rawSiteKey);
            if (!siteKey) {
                return { ok: false as const, error: 'Invalid site key' };
            }
            const { getSignedSiteSummary } = await import('../services/siteAuthCookieStore');
            const row = getSignedSiteSummary(siteKey);
            if (!row) {
                return { ok: false as const, error: 'No saved session for this site' };
            }
            return { ok: true as const, row };
        })
    );

    ipcMain.handle(
        IPC_INVOKE.siteAuthClearSignedSite,
        withValidSender(deps, async (event, rawSiteKey: unknown) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.siteAuthClearSignedSite)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            const key = parseIpcPayload(nonEmptyTrimmedStringSchema, rawSiteKey);
            if (!key) {
                return { ok: false as const, error: 'Invalid site key' };
            }
            const { purgeSignedSiteSession } = await import(
                '../services/siteAuthBrowserController'
            );
            await purgeSignedSiteSession(key);
            safeSend(event.sender, IPC_MAIN_TO_RENDERER.siteAuthCookieRefresh, {
                siteKey: key,
                outcome: 'success',
                cookieCount: 0
            });
            return { ok: true as const };
        })
    );
}
