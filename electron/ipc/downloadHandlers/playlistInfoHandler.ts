import { ipcMain } from 'electron';
import { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from '../../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, type IpcFailureEnvelope, ipcFail } from '../../../src/shared/ipcErrors';
import {
    httpMediaUrlSchema,
    nonEmptyTrimmedStringSchema
} from '../../../src/shared/ipcPayloadSchemas';
import type { MediaLookupResult, PlaylistInfo } from '../../../src/types';
import { translateMainError } from '../../i18n/mainI18n';
import { safeSend } from '../../mainHelpers';
import { mainLog } from '../../mainLogger';
import { tryConsumeIpcRateLimitSlot } from '../rateLimiter';
import type { IpcHandlerDeps } from '../types';
import { parseIpcPayload, withValidSender } from '../validateIpcPayload';

export function registerPlaylistInfoHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.downloadFetchPlaylistInfo,
        withValidSender(
            deps,
            async (_event, rawUrl: unknown): Promise<MediaLookupResult<PlaylistInfo>> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadFetchPlaylistInfo)) {
                    return { data: null, error: translateMainError('ipcRateLimited') };
                }
                const url = parseIpcPayload(httpMediaUrlSchema, rawUrl);
                if (!url) {
                    return { data: null, error: translateMainError('invalidRendererRequest') };
                }

                const { fetchPlaylistInfo } = await deps.loadMetadataService();
                try {
                    return {
                        data: await fetchPlaylistInfo(url, await deps.resolveFetchMetadataOptions())
                    };
                } catch (error) {
                    mainLog.error('[download:fetch-playlist-info]', { url, err: String(error) });
                    return {
                        data: null,
                        error:
                            error instanceof Error
                                ? error.message
                                : translateMainError('fetchPlaylistMetadataFallback')
                    };
                }
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadPlaylistStreamStart,
        withValidSender(
            deps,
            async (event, rawUrl: unknown): Promise<{ streamId: string } | { error: string }> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadPlaylistStreamStart)) {
                    return { error: translateMainError('ipcRateLimited') };
                }
                const url = parseIpcPayload(httpMediaUrlSchema, rawUrl);
                if (!url) {
                    return { error: translateMainError('invalidRendererRequest') };
                }

                const streamId = crypto.randomUUID();
                const wc = event.sender;
                const { streamFetchPlaylistInfo } = await deps.loadMetadataService();
                const progressCh = IPC_MAIN_TO_RENDERER.downloadPlaylistStreamProgress;
                void (async () => {
                    try {
                        await streamFetchPlaylistInfo(
                            url,
                            await deps.resolveFetchMetadataOptions(),
                            streamId,
                            (evt) => {
                                safeSend(wc, progressCh, { streamId, ...evt });
                            }
                        );
                    } catch (error) {
                        mainLog.error('[download:playlist-stream:start]', {
                            url,
                            err: String(error)
                        });
                        safeSend(wc, progressCh, {
                            streamId,
                            kind: 'error',
                            message:
                                error instanceof Error
                                    ? error.message
                                    : translateMainError('fetchPlaylistMetadataFallback')
                        });
                    }
                })();

                return { streamId };
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadPlaylistStreamCancel,
        withValidSender(
            deps,
            async (_event, rawStreamId: unknown): Promise<boolean | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadPlaylistStreamCancel)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const streamId = parseIpcPayload(nonEmptyTrimmedStringSchema, rawStreamId);
                if (!streamId) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const { killPlaylistInfoStream } = await deps.loadMetadataService();
                killPlaylistInfoStream(streamId);
                return true;
            }
        )
    );
}
