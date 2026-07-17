import { ipcMain } from 'electron';
import { IPC_INVOKE } from '../../src/shared/ipcChannels';
import { reportRendererErrorPayloadSchema } from '../../src/shared/ipcPayloadSchemas';
import { captureMainException } from '../lib/errorTelemetry';
import { mainLog } from '../mainLogger';
import { tryConsumeIpcRateLimitSlot } from './rateLimiter';
import type { IpcHandlerDeps } from './types';
import { parseIpcPayload, withValidSender } from './validateIpcPayload';

/** Registers the renderer-error reporting channel (uncaught renderer JS errors → main log). */
export function registerRendererErrorHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.appReportRendererError,
        withValidSender(deps, (_event, rawPayload: unknown) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.appReportRendererError)) {
                return;
            }
            const payload = parseIpcPayload(reportRendererErrorPayloadSchema, rawPayload);
            if (!payload) {
                return;
            }
            const { message, source, stack } = payload;
            mainLog.error('[renderer:error]', { message, source, stack });
            captureMainException(new Error(message), { source, stack });
        })
    );
}
