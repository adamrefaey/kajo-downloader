import { stat } from 'node:fs/promises';
import { ipcMain, shell } from 'electron';
import { IPC_INVOKE } from '../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, ipcFail } from '../../src/shared/ipcErrors';
import { nonEmptyTrimmedStringSchema } from '../../src/shared/ipcPayloadSchemas';
import { translateMainError } from '../i18n/mainI18n';
import { isPathInsideRoot } from '../lib/isPathInsideRoot';
import { isOpenableLocalMediaPath } from '../mainHelpers';
import { tryConsumeIpcRateLimitSlot } from './rateLimiter';
import type { IpcHandlerDeps } from './types';
import { parseIpcPayload, withValidSender } from './validateIpcPayload';

async function resolveSafeLocalMediaPath(
    deps: IpcHandlerDeps,
    rawPath: unknown
): Promise<string | null> {
    const candidate = parseIpcPayload(nonEmptyTrimmedStringSchema, rawPath);
    if (!candidate) {
        return null;
    }
    // Extension / absolute-path allowlist before any FS touch (Electron checklist #15).
    if (!isOpenableLocalMediaPath(candidate)) {
        return null;
    }
    // Confine open/reveal to the configured download tree — same trust model as cleanup/start.
    const outputDir = deps.getSettings().outputDir?.trim() ?? '';
    if (!outputDir || !isPathInsideRoot(outputDir, candidate)) {
        return null;
    }
    try {
        const stats = await stat(candidate);
        if (!stats.isFile()) {
            return null;
        }
    } catch {
        return null;
    }
    return candidate;
}

export function registerLocalFilesHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.localFilesOpenPath,
        withValidSender(
            deps,
            async (_event, rawPath: unknown): Promise<boolean | ReturnType<typeof ipcFail>> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.localFilesOpenPath)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const invalid = ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
                const candidate = await resolveSafeLocalMediaPath(deps, rawPath);
                if (!candidate) {
                    return invalid;
                }
                const errMsg = await shell.openPath(candidate);
                return errMsg === '';
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.localFilesRevealPath,
        withValidSender(
            deps,
            async (_event, rawPath: unknown): Promise<boolean | ReturnType<typeof ipcFail>> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.localFilesRevealPath)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const invalid = ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
                const candidate = await resolveSafeLocalMediaPath(deps, rawPath);
                if (!candidate) {
                    return invalid;
                }
                shell.showItemInFolder(candidate);
                return true;
            }
        )
    );
}
