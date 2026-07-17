import { ipcMain, shell } from 'electron';
import { IPC_INVOKE } from '../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, type IpcFailureEnvelope, ipcFail } from '../../src/shared/ipcErrors';
import { urlArgSchema } from '../../src/shared/ipcPayloadSchemas';
import { translateMainError } from '../i18n/mainI18n';
import { isSafeOpenExternalUrl } from '../mainHelpers';
import { tryConsumeIpcRateLimitSlot } from './rateLimiter';
import type { IpcHandlerDeps } from './types';
import { parseIpcPayload, withValidSender } from './validateIpcPayload';

/** Opens an allowlisted external URL in the user's default browser (no app navigation). */
export function registerExternalLinkHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.authOpenExternal,
        withValidSender(deps, (_event, rawUrl: unknown): boolean | IpcFailureEnvelope => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.authOpenExternal)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            const trimmed = parseIpcPayload(urlArgSchema, rawUrl);
            if (!trimmed || !isSafeOpenExternalUrl(trimmed)) {
                return ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
            }
            void shell.openExternal(trimmed);
            return true;
        })
    );
}
