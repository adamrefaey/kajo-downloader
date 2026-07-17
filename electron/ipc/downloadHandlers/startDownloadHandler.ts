import { access, appendFile, constants, readdir, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { app, ipcMain } from 'electron';
import { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from '../../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, type IpcFailureEnvelope, ipcFail } from '../../../src/shared/ipcErrors';
import {
    checkDownloadFilePathsPayloadSchema,
    cleanupDownloadArtifactsPayloadSchema,
    cleanupEmptyBatchDirsPayloadSchema,
    nonEmptyTrimmedStringSchema,
    prepareChannelOutputDirPayloadSchema,
    preparePlaylistOutputDirPayloadSchema,
    startDownloadPayloadSchema
} from '../../../src/shared/ipcPayloadSchemas';
import { isProhibitedAdultMediaUrl } from '../../../src/shared/prohibitedAdultContentHosts';
import type { StartDownloadOutcome } from '../../../src/types';
import { translateMainError } from '../../i18n/mainI18n';
import { isPathInsideRoot } from '../../lib/isPathInsideRoot';
import { safeSend } from '../../mainHelpers';
import { mainLog } from '../../mainLogger';
import { notifyDownloadComplete, notifyDownloadError } from '../../services/desktopNotifications';
import {
    mergeAdvancedStartCapabilities,
    mergeWithAutomaticFileEmbedding,
    normalizeMergedCapabilities,
    sanitizeDownloadEngineCapabilities
} from '../../services/downloadCapabilities';
import { appendDownloadHistoryEvent } from '../../services/historyArchive';
import { tryConsumeIpcRateLimitSlot } from '../rateLimiter';
import type { IpcHandlerDeps } from '../types';
import { parseIpcPayload, withValidSender } from '../validateIpcPayload';

function pathsConfinedToOutputDir(
    outputDir: string,
    paths: string[]
): { ok: true; resolved: string[] } | { ok: false } {
    const root = outputDir.trim();
    if (!root) {
        return { ok: false };
    }
    const resolved = paths.map((p) => resolve(p));
    if (!resolved.every((p) => isPathInsideRoot(root, p))) {
        return { ok: false };
    }
    return { ok: true, resolved };
}

export function registerStartDownloadHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.downloadStart,
        withValidSender(
            deps,
            async (
                event,
                rawPayload: unknown
            ): Promise<StartDownloadOutcome | IpcFailureEnvelope | null> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadStart)) {
                    return ipcFail(
                        IPC_ERROR_CODES.rateLimited,
                        translateMainError('ipcRateLimited')
                    );
                }
                const payload = parseIpcPayload(startDownloadPayloadSchema, rawPayload);
                if (!payload) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }

                const { startDownload } = await deps.loadYtdlpService();
                const baseSettings = deps.getSettings();

                const startPathCandidates = [
                    payload.outputDir,
                    ...(typeof payload.reservedOutputPath === 'string' &&
                    payload.reservedOutputPath.trim()
                        ? [payload.reservedOutputPath]
                        : [])
                ];
                const startPathsOk = pathsConfinedToOutputDir(
                    baseSettings.outputDir,
                    startPathCandidates
                );
                if (!startPathsOk.ok) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }

                if (isProhibitedAdultMediaUrl(payload.url)) {
                    return { blocked: true, policy: 'prohibited_adult_content' };
                }

                const sanitizedOverlay = sanitizeDownloadEngineCapabilities(payload.capabilities);
                let capabilities = mergeAdvancedStartCapabilities(
                    baseSettings.advancedDownloadDefaults,
                    sanitizedOverlay
                );
                capabilities = normalizeMergedCapabilities(capabilities);
                capabilities = mergeWithAutomaticFileEmbedding(capabilities);

                const outputTemplate = deps.resolveEffectiveOutputTemplate(
                    payload,
                    baseSettings.advancedDownloadDefaults
                );

                let resolvedDownloadArchivePath: string | null = null;
                if (capabilities?.archive?.enabled === true) {
                    const archivePath = join(app.getPath('userData'), 'download-archive.txt');
                    try {
                        await appendFile(archivePath, '', { flag: 'a' });
                        resolvedDownloadArchivePath = archivePath;
                    } catch (err) {
                        mainLog.warn(
                            '[download:start] download archive path inaccessible — archiving disabled for this download',
                            { err: String(err), archivePath }
                        );
                        if (capabilities.archive) {
                            capabilities = {
                                ...capabilities,
                                archive: { ...capabilities.archive, enabled: false }
                            };
                        }
                    }
                }

                const notificationSnapshot = baseSettings.notificationSettings;
                const fetchMetadataOptions = await deps.resolveFetchMetadataOptions();

                const result = await startDownload({
                    ...payload,
                    outputDir: payload.outputDir,
                    outputTemplate,
                    playlistId: payload.playlistId ?? null,
                    webContents: event.sender,
                    capabilities,
                    resolvedDownloadArchivePath,
                    reservedOutputPathHint: payload.reservedOutputPath ?? null,
                    downloadTrace: {
                        url: payload.url,
                        mediaTitle:
                            typeof payload.mediaTitle === 'string' ? payload.mediaTitle : null,
                        queuedAtMs:
                            typeof payload.queuedAtMs === 'number' &&
                            Number.isFinite(payload.queuedAtMs)
                                ? Math.floor(payload.queuedAtMs)
                                : Date.now()
                    },
                    onDownloadTerminal: (info) => {
                        appendDownloadHistoryEvent({
                            downloadId: info.downloadId,
                            url: info.url,
                            title: info.mediaTitle,
                            status:
                                info.outcome === 'success'
                                    ? 'complete'
                                    : info.outcome === 'cancelled'
                                      ? 'cancelled'
                                      : 'error',
                            filePath: info.filePath,
                            errorMessage: info.errorMessage,
                            queuedAtMs: info.queuedAtMs
                        });
                        if (info.outcome === 'success') {
                            notifyDownloadComplete(
                                notificationSnapshot,
                                info.mediaTitle ?? 'Download',
                                info.filePath ?? ''
                            );
                        } else if (info.outcome === 'error') {
                            notifyDownloadError(
                                notificationSnapshot,
                                info.mediaTitle ?? 'Download',
                                info.errorMessage ?? ''
                            );
                        }
                    },
                    ...fetchMetadataOptions
                } as import('../../services/ytdlp/types').StartDownloadOptions);

                return result;
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadPreparePlaylistOutputDir,
        withValidSender(
            deps,
            async (_event, rawPayload: unknown): Promise<string | IpcFailureEnvelope | null> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadPreparePlaylistOutputDir)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const payload = parseIpcPayload(preparePlaylistOutputDirPayloadSchema, rawPayload);
                if (!payload) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const playlistRootOk = pathsConfinedToOutputDir(deps.getSettings().outputDir, [
                    payload.outputDir
                ]);
                if (!playlistRootOk.ok) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }

                return deps.preparePlaylistOutputDir(payload);
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadPrepareChannelOutputDir,
        withValidSender(deps, async (_event, rawPayload: unknown) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadPrepareChannelOutputDir)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            const payload = parseIpcPayload(prepareChannelOutputDirPayloadSchema, rawPayload);
            if (!payload) {
                return ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
            }
            const channelRootOk = pathsConfinedToOutputDir(deps.getSettings().outputDir, [
                payload.outputDir
            ]);
            if (!channelRootOk.ok) {
                return ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
            }

            return deps.prepareChannelOutputDir(payload);
        })
    );

    ipcMain.handle(
        IPC_INVOKE.downloadCancel,
        withValidSender(
            deps,
            async (_event, rawId: unknown): Promise<boolean | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadCancel)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const downloadId = parseIpcPayload(nonEmptyTrimmedStringSchema, rawId);
                if (!downloadId) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const { cancelDownload } = await deps.loadYtdlpService();
                return cancelDownload(downloadId);
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadPause,
        withValidSender(
            deps,
            async (event, rawId: unknown): Promise<boolean | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadPause)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const downloadId = parseIpcPayload(nonEmptyTrimmedStringSchema, rawId);
                if (!downloadId) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const { pauseDownload } = await deps.loadYtdlpService();
                const paused = await pauseDownload(downloadId);
                if (paused && !event.sender.isDestroyed()) {
                    safeSend(event.sender, IPC_MAIN_TO_RENDERER.downloadStateChange, {
                        downloadId,
                        state: 'paused',
                        pauseReason: 'manual'
                    });
                }
                return paused;
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadResume,
        withValidSender(
            deps,
            async (event, rawId: unknown): Promise<boolean | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadResume)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const downloadId = parseIpcPayload(nonEmptyTrimmedStringSchema, rawId);
                if (!downloadId) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const { resumeDownload } = await deps.loadYtdlpService();
                const resumed = await resumeDownload(downloadId);
                if (!event.sender.isDestroyed()) {
                    safeSend(event.sender, IPC_MAIN_TO_RENDERER.downloadStateChange, {
                        downloadId,
                        state: resumed ? 'downloading' : 'pending',
                        pauseReason: undefined
                    });
                }
                return resumed;
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadCleanupArtifacts,
        withValidSender(
            deps,
            async (_event, rawPayload: unknown): Promise<undefined | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadCleanupArtifacts)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const payload = parseIpcPayload(cleanupDownloadArtifactsPayloadSchema, rawPayload);
                if (!payload) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }

                const settingsOutputDir = deps.getSettings().outputDir;
                const pathCandidates = [
                    payload.outputDir,
                    ...(typeof payload.reservedOutputPath === 'string' &&
                    payload.reservedOutputPath.trim()
                        ? [payload.reservedOutputPath]
                        : []),
                    ...(typeof payload.partialFilePath === 'string' &&
                    payload.partialFilePath.trim()
                        ? [payload.partialFilePath]
                        : [])
                ];
                const confined = pathsConfinedToOutputDir(settingsOutputDir, pathCandidates);
                if (!confined.ok) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }

                const { cleanupDownloadArtifactsForQueuedRemoval } = await deps.loadYtdlpService();
                await cleanupDownloadArtifactsForQueuedRemoval({
                    downloadId: payload.downloadId,
                    outputDir: resolve(payload.outputDir),
                    ...(payload.audioOnly !== undefined ? { audioOnly: payload.audioOnly } : {}),
                    reservedOutputPath: payload.reservedOutputPath ?? null,
                    partialFilePath: payload.partialFilePath ?? null
                });
                return undefined;
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadCleanupEmptyBatchDirs,
        withValidSender(
            deps,
            async (_event, rawDirs: unknown): Promise<undefined | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadCleanupEmptyBatchDirs)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const payload = parseIpcPayload(
                    cleanupEmptyBatchDirsPayloadSchema,
                    rawDirs,
                    IPC_INVOKE.downloadCleanupEmptyBatchDirs
                );
                if (!payload) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                if (payload.length === 0) {
                    return;
                }
                const outputDir = deps.getSettings().outputDir;
                const confined = pathsConfinedToOutputDir(outputDir, payload);
                if (!confined.ok) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const dirs = [...new Set(confined.resolved)];
                const outputRoot = resolve(outputDir.trim());
                for (const dir of dirs) {
                    try {
                        const entries = await readdir(dir);
                        if (entries.length === 0) {
                            await rmdir(dir);
                            // Attempt one level up (e.g. channel root after section subfolders removed).
                            // Never remove the configured download root itself.
                            const parent = dirname(dir);
                            if (
                                parent !== dir &&
                                parent !== outputRoot &&
                                isPathInsideRoot(outputRoot, parent)
                            ) {
                                try {
                                    const parentEntries = await readdir(parent);
                                    if (parentEntries.length === 0) {
                                        await rmdir(parent);
                                    }
                                } catch {
                                    // Parent may not exist or may still have files; ignore.
                                }
                            }
                        }
                    } catch {
                        // Dir may not exist or still has files (completed downloads remain); ignore.
                    }
                }
                return undefined;
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.downloadCheckFilePaths,
        withValidSender(
            deps,
            async (_event, rawEntries: unknown): Promise<string[] | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.downloadCheckFilePaths)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const payload = parseIpcPayload(
                    checkDownloadFilePathsPayloadSchema,
                    rawEntries,
                    IPC_INVOKE.downloadCheckFilePaths
                );
                if (!payload) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                if (payload.length === 0) {
                    return [];
                }
                const outputDir = deps.getSettings().outputDir;
                const confined = pathsConfinedToOutputDir(
                    outputDir,
                    payload.map((e) => e.filePath)
                );
                if (!confined.ok) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }
                const staleIds: string[] = [];
                await Promise.all(
                    payload.map(async (entry) => {
                        try {
                            await access(resolve(entry.filePath), constants.F_OK);
                        } catch {
                            staleIds.push(entry.id);
                        }
                    })
                );
                return staleIds;
            }
        )
    );
}
