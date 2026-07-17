import { ipcMain } from 'electron';
import { IPC_INVOKE } from '../../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, type IpcFailureEnvelope, ipcFail } from '../../../src/shared/ipcErrors';
import { downloadHistoryListOptsSchema } from '../../../src/shared/ipcPayloadSchemas';
import { translateMainError } from '../../i18n/mainI18n';
import {
    clearDownloadHistory,
    getDownloadHistoryTotal,
    listDownloadHistory
} from '../../services/historyArchive';
import { tryConsumeIpcRateLimitSlot } from '../rateLimiter';
import type { IpcHandlerDeps } from '../types';
import { parseIpcPayload, withValidSender } from '../validateIpcPayload';

export function registerHistoryHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.downloadHistoryList,
        withValidSender(deps, async (_event, raw: unknown) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadHistoryList)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            const normalized =
                raw === undefined || raw === null
                    ? {}
                    : raw != null && typeof raw === 'object' && !Array.isArray(raw)
                      ? raw
                      : null;
            if (normalized === null) {
                return ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
            }
            const o = parseIpcPayload(downloadHistoryListOptsSchema, normalized);
            if (!o) {
                return ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
            }
            const limit = o.limit !== undefined && Number.isFinite(o.limit) ? o.limit : 50;
            const offset = o.offset !== undefined && Number.isFinite(o.offset) ? o.offset : 0;
            return listDownloadHistory({ limit, offset });
        })
    );

    ipcMain.handle(
        IPC_INVOKE.downloadHistoryClear,
        withValidSender(deps, async (_event): Promise<boolean | IpcFailureEnvelope> => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadHistoryClear)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            clearDownloadHistory();
            return true;
        })
    );

    ipcMain.handle(
        IPC_INVOKE.downloadHistoryTotal,
        withValidSender(deps, async (_event) => {
            return getDownloadHistoryTotal();
        })
    );
}
