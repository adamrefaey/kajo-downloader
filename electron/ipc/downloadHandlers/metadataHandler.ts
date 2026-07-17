import { ipcMain } from 'electron';
import { IPC_INVOKE } from '../../../src/shared/ipcChannels';
import { httpMediaUrlSchema } from '../../../src/shared/ipcPayloadSchemas';
import { buildStaticMetadataResolveContext } from '../../../src/shared/urlSiteResolveContext';
import type { MetadataResolveResult } from '../../../src/types';
import { translateMainError } from '../../i18n/mainI18n';
import { mainLog } from '../../mainLogger';
import { tryConsumeIpcRateLimitSlot } from '../rateLimiter';
import type { IpcHandlerDeps } from '../types';
import { parseIpcPayload, withValidSender } from '../validateIpcPayload';

export function registerMetadataHandler(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.downloadMetadataResolveUrl,
        withValidSender(deps, async (_event, rawUrl: unknown): Promise<MetadataResolveResult> => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadMetadataResolveUrl)) {
                const raw = typeof rawUrl === 'string' ? rawUrl : '';
                return {
                    kind: 'unsupported',
                    url: raw,
                    message: translateMainError('ipcRateLimited'),
                    ...buildStaticMetadataResolveContext(raw)
                };
            }

            const url = parseIpcPayload(httpMediaUrlSchema, rawUrl);
            if (!url) {
                return {
                    kind: 'unsupported',
                    url: '',
                    message: translateMainError('invalidRendererRequest'),
                    ...buildStaticMetadataResolveContext('')
                };
            }

            const { resolveMediaUrlMetadata } = await deps.loadMetadataService();
            try {
                return await resolveMediaUrlMetadata(url, await deps.resolveFetchMetadataOptions());
            } catch (error) {
                mainLog.error('[download:metadata-resolve-url]', { url, err: String(error) });
                const trimmed = url.trim();
                return {
                    kind: 'unsupported' as const,
                    url: trimmed,
                    message:
                        error instanceof Error
                            ? error.message
                            : translateMainError('fetchVideoMetadataFallback'),
                    ...buildStaticMetadataResolveContext(trimmed)
                };
            }
        })
    );
}
