import type { IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import { IPC_ERROR_CODES, type IpcFailureEnvelope, ipcFail } from '../../src/shared/ipcErrors';
import { translateMainError } from '../i18n/mainI18n';
import { mainLog } from '../mainLogger';
import type { IpcHandlerDeps } from './types';

/**
 * Higher-order function that guards an IPC handler behind a sender-origin check.
 * If the sender is invalid, returns an {@link IpcFailureEnvelope} immediately so the
 * preload's `mapInvokeResult` can translate it to the appropriate fallback value.
 * Eliminates the ~93 repeated `if (!deps.isValidIpcSender(event)) { return ipcFail(...) }`
 * blocks across the handler files.
 */
export function withValidSender<TArgs extends unknown[], TReturn>(
    deps: Pick<IpcHandlerDeps, 'isValidIpcSender'>,
    handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TReturn
): (event: IpcMainInvokeEvent, ...args: TArgs) => TReturn | IpcFailureEnvelope {
    return (event: IpcMainInvokeEvent, ...args: TArgs): TReturn | IpcFailureEnvelope => {
        if (!deps.isValidIpcSender(event)) {
            return ipcFail(
                IPC_ERROR_CODES.invalidSender,
                translateMainError('invalidRendererRequest')
            );
        }
        return handler(event, ...args);
    };
}

export function parseIpcPayload<T>(schema: z.ZodType<T>, raw: unknown, channel?: string): T | null {
    const r = schema.safeParse(raw);
    if (!r.success) {
        mainLog.warn('[ipc:validatePayload] validation failed', {
            channel: channel ?? 'unknown',
            issues: r.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
                code: i.code
            })),
            received: typeof raw
        });
    }
    return r.success ? r.data : null;
}
