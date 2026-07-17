import { ipcMain } from 'electron';
import { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from '../../../src/shared/ipcChannels';
import { httpMediaUrlSchema } from '../../../src/shared/ipcPayloadSchemas';
import type { MediaLookupResult, VideoInfo } from '../../../src/types';
import { translateMainError } from '../../i18n/mainI18n';
import { safeSend } from '../../mainHelpers';
import { mainLog } from '../../mainLogger';
import { tryConsumeIpcRateLimitSlot } from '../rateLimiter';
import type { IpcHandlerDeps } from '../types';
import { parseIpcPayload, withValidSender } from '../validateIpcPayload';

export function registerVideoInfoHandler(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.downloadFetchVideoInfo,
        withValidSender(
            deps,
            async (event, rawUrl: unknown): Promise<MediaLookupResult<VideoInfo>> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadFetchVideoInfo)) {
                    return { data: null, error: translateMainError('ipcRateLimited') };
                }
                const url = parseIpcPayload(httpMediaUrlSchema, rawUrl);
                if (!url) {
                    return { data: null, error: translateMainError('invalidRendererRequest') };
                }

                const { fetchMetadata } = await deps.loadMetadataService();
                try {
                    return {
                        data: await fetchMetadata(url, {
                            ...(await deps.resolveFetchMetadataOptions()),
                            onEmbeddedThumbnail: (thumb) => {
                                if (event.sender.isDestroyed()) {
                                    return;
                                }
                                safeSend(
                                    event.sender,
                                    IPC_MAIN_TO_RENDERER.downloadVideoThumbnail,
                                    thumb
                                );
                            }
                        })
                    };
                } catch (error) {
                    mainLog.error('[download:fetch-video-info]', { url, err: String(error) });
                    return {
                        data: null,
                        error:
                            error instanceof Error
                                ? error.message
                                : translateMainError('fetchVideoMetadataFallback')
                    };
                }
            }
        )
    );
}
