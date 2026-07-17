import type { IpcRenderer } from 'electron';
import { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from '../../src/shared/ipcChannels';
import type { SiteAuthOpenPayload } from '../../src/shared/ipcPayloadSchemas';
import type { RendererApi } from '../../src/shared/rendererApi';
import type { SearchUsage, SearchUsageResponse } from '../../src/shared/searchQuota';
import type {
    AppSettings,
    DownloadHistoryEntry,
    MediaLookupResult,
    MetadataResolveResult,
    PlaylistInfo,
    PlaylistInfoStreamIpcEvent,
    SetupStatus,
    SignedSiteSummary,
    StartDownloadOutcome,
    VideoInfo
} from '../../src/types';
import { onChannel, onSignalChannel } from './subscriptions';
import { recordIfIpcFailureEnvelope, wrapInvoke } from './wrapInvoke';

type RendererPlatform = 'macos' | 'windows' | 'linux' | 'unknown';

const NODE_PLATFORM_TO_RENDERER: Partial<Record<NodeJS.Platform, RendererPlatform>> = {
    darwin: 'macos',
    win32: 'windows',
    linux: 'linux'
};

export function createRendererApi(
    ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'off'>,
    platform: NodeJS.Platform
): RendererApi {
    return {
        getPlatform: () => NODE_PLATFORM_TO_RENDERER[platform] ?? 'unknown',
        fetchVideoInfo: (url) =>
            wrapInvoke<MediaLookupResult<VideoInfo>>(
                ipcRenderer,
                'passthrough',
                IPC_INVOKE.downloadFetchVideoInfo,
                url
            ),
        fetchPlaylistInfo: (url) =>
            wrapInvoke<MediaLookupResult<PlaylistInfo>>(
                ipcRenderer,
                'passthrough',
                IPC_INVOKE.downloadFetchPlaylistInfo,
                url
            ),
        fetchPlaylistInfoStream: async (url, onEvent) => {
            const result = await ipcRenderer.invoke(IPC_INVOKE.downloadPlaylistStreamStart, url);
            if (recordIfIpcFailureEnvelope(result)) {
                onEvent({ kind: 'error', message: result.message });
                return () => {};
            }
            const typed = result as { streamId: string } | { error: string } | null | undefined;
            if (typed == null || typeof typed !== 'object') {
                onEvent({ kind: 'error', message: 'Playlist stream failed to start' });
                return () => {};
            }
            if ('error' in typed) {
                onEvent({ kind: 'error', message: typed.error });
                return () => {};
            }
            const { streamId } = typed;
            if (!streamId) {
                onEvent({ kind: 'error', message: 'Playlist stream failed to start' });
                return () => {};
            }
            const channel = IPC_MAIN_TO_RENDERER.downloadPlaylistStreamProgress;
            const listener = (
                _e: unknown,
                payload: { streamId: string } & PlaylistInfoStreamIpcEvent
            ): void => {
                if (payload.streamId !== streamId) {
                    return;
                }
                const { streamId: _sid, ...evt } = payload;
                onEvent(evt);
                if (evt.kind === 'done' || evt.kind === 'error') {
                    ipcRenderer.off(channel, listener);
                }
            };
            ipcRenderer.on(channel, listener);
            return () => {
                ipcRenderer.off(channel, listener);
                void wrapInvoke<boolean>(
                    ipcRenderer,
                    'false',
                    IPC_INVOKE.downloadPlaylistStreamCancel,
                    streamId
                );
            };
        },
        resolveMetadataUrl: (url) =>
            wrapInvoke<MetadataResolveResult>(
                ipcRenderer,
                'passthrough',
                IPC_INVOKE.downloadMetadataResolveUrl,
                url
            ),
        preparePlaylistOutputDir: (payload) =>
            wrapInvoke<string | null>(
                ipcRenderer,
                'null',
                IPC_INVOKE.downloadPreparePlaylistOutputDir,
                payload
            ),
        prepareChannelOutputDir: (payload) =>
            wrapInvoke<{
                channelDir: string;
                sectionDirs: Partial<Record<'videos' | 'shorts' | 'live', string>>;
            } | null>(ipcRenderer, 'null', IPC_INVOKE.downloadPrepareChannelOutputDir, payload),
        startDownload: (payload) =>
            wrapInvoke<StartDownloadOutcome | null>(
                ipcRenderer,
                'null',
                IPC_INVOKE.downloadStart,
                payload
            ),
        cancelDownload: (downloadId) =>
            wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.downloadCancel, downloadId),
        cleanupDownloadArtifacts: (payload) =>
            wrapInvoke<void>(ipcRenderer, 'void', IPC_INVOKE.downloadCleanupArtifacts, payload),
        cleanupEmptyBatchDirs: (dirs: string[]) =>
            wrapInvoke<void>(ipcRenderer, 'void', IPC_INVOKE.downloadCleanupEmptyBatchDirs, dirs),
        pauseDownload: (downloadId) =>
            wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.downloadPause, downloadId),
        resumeDownload: (downloadId) =>
            wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.downloadResume, downloadId),
        checkDownloadFilePaths: (entries: Array<{ id: string; filePath: string }>) =>
            wrapInvoke<string[]>(
                ipcRenderer,
                'empty-array',
                IPC_INVOKE.downloadCheckFilePaths,
                entries
            ),
        selectOutputFolder: () =>
            wrapInvoke<string | null>(ipcRenderer, 'null', IPC_INVOKE.settingsSelectOutputFolder),
        getSettings: () =>
            wrapInvoke<AppSettings | null>(ipcRenderer, 'null', IPC_INVOKE.settingsGet),
        getSystemLocale: () =>
            wrapInvoke<string | null>(ipcRenderer, 'null', IPC_INVOKE.settingsGetSystemLocale),
        setSettings: (patch) =>
            wrapInvoke<AppSettings | null>(ipcRenderer, 'null', IPC_INVOKE.settingsSet, patch),
        downloadHistory: {
            list: (opts) =>
                wrapInvoke<DownloadHistoryEntry[] | null>(
                    ipcRenderer,
                    'null',
                    IPC_INVOKE.downloadHistoryList,
                    opts
                ),
            clear: () =>
                wrapInvoke<boolean | null>(ipcRenderer, 'false', IPC_INVOKE.downloadHistoryClear),
            total: () =>
                wrapInvoke<number | null>(ipcRenderer, 'null', IPC_INVOKE.downloadHistoryTotal)
        },
        setProxyProfileUrl: (payload) =>
            wrapInvoke<{ ok: true } | { ok: false; error: string } | null>(
                ipcRenderer,
                'null',
                IPC_INVOKE.settingsProxySetProfileUrl,
                payload
            ),
        checkSetup: () =>
            wrapInvoke<SetupStatus | null>(ipcRenderer, 'null', IPC_INVOKE.setupCheck),
        installYtdlp: () =>
            wrapInvoke<SetupStatus | null>(ipcRenderer, 'null', IPC_INVOKE.setupInstallYtdlp),
        openExternal: (url) =>
            wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.authOpenExternal, url),
        onDownloadProgress: (callback) =>
            onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.downloadProgress, callback),
        onDownloadComplete: (callback) =>
            onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.downloadComplete, callback),
        onDownloadError: (callback) =>
            onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.downloadError, callback),
        onDownloadStateChange: (callback) =>
            onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.downloadStateChange, callback),
        onClipboardUrlDetected: (callback) =>
            onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.appClipboardUrlDetected, callback),
        onSetupLog: (callback) => onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.setupLog, callback),
        onSetupComplete: (callback) =>
            onSignalChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.setupComplete, callback),
        onVideoInfoThumbnail: (callback) =>
            onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.downloadVideoThumbnail, callback),
        siteAuth: {
            open: async (payload: SiteAuthOpenPayload) => {
                const raw = await ipcRenderer.invoke(IPC_INVOKE.siteAuthOpen, payload);
                if (recordIfIpcFailureEnvelope(raw)) {
                    return { ok: false as const, error: raw.message };
                }
                return raw as
                    | { ok: true; siteKey: string; allowedSuffixes: string[] }
                    | { ok: false; error: string };
            },
            close: () => wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.siteAuthClose),
            setEmbedBounds: (bounds) =>
                wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.siteAuthSetBounds, bounds),
            goBack: () => wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.siteAuthGoBack),
            goForward: () =>
                wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.siteAuthGoForward),
            reload: () => wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.siteAuthReload),
            saveAndClose: async () => {
                const raw = await ipcRenderer.invoke(IPC_INVOKE.siteAuthSave);
                if (recordIfIpcFailureEnvelope(raw)) {
                    return { ok: false as const, error: raw.message };
                }
                return raw as
                    | { ok: true; cookieCount: number; siteKey: string }
                    | { ok: false; error: string };
            },
            onLoading: (callback) =>
                onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.siteAuthLoading, callback),
            onUrlState: (callback) =>
                onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.siteAuthUrlState, callback),
            onNavBlocked: (callback) =>
                onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.siteAuthNavBlocked, callback),
            listSignedSites: () =>
                wrapInvoke<SignedSiteSummary[]>(
                    ipcRenderer,
                    'empty-array',
                    IPC_INVOKE.siteAuthListSignedSites
                ),
            validateSignedSite: async (siteKey) => {
                const raw = await ipcRenderer.invoke(
                    IPC_INVOKE.siteAuthValidateSignedSite,
                    siteKey
                );
                if (recordIfIpcFailureEnvelope(raw)) {
                    return { ok: false as const, error: raw.message };
                }
                return raw as { ok: true; row: SignedSiteSummary } | { ok: false; error: string };
            },
            clearSignedSite: async (siteKey) => {
                const raw = await ipcRenderer.invoke(IPC_INVOKE.siteAuthClearSignedSite, siteKey);
                if (recordIfIpcFailureEnvelope(raw)) {
                    return { ok: false as const, error: raw.message };
                }
                return raw as { ok: true } | { ok: false; error: string };
            },
            onCookieRefresh: (callback) =>
                onChannel(ipcRenderer, IPC_MAIN_TO_RENDERER.siteAuthCookieRefresh, callback)
        },
        search: {
            getUsage: () =>
                wrapInvoke<SearchUsageResponse | null>(
                    ipcRenderer,
                    'null',
                    IPC_INVOKE.searchGetUsage
                ),
            search: (payload) =>
                wrapInvoke<
                    | {
                          ok: true;
                          results: import('../../src/types').SearchResultRow[];
                          usage?: SearchUsage;
                      }
                    | { ok: false; error: string; usage?: SearchUsage }
                    | null
                >(ipcRenderer, 'null', IPC_INVOKE.youtubeSearch, payload)
        },
        localFiles: {
            openPath: (filePath: string) =>
                wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.localFilesOpenPath, filePath),
            revealPath: (filePath: string) =>
                wrapInvoke<boolean>(ipcRenderer, 'false', IPC_INVOKE.localFilesRevealPath, filePath)
        },
        reportRendererError: (payload: { message: string; source: string; stack?: string }) => {
            // Fire-and-forget: renderer errors are best-effort — never throw.
            void ipcRenderer.invoke(IPC_INVOKE.appReportRendererError, payload).catch((_err) => {
                // Silently ignored in preload — main process is unavailable or crashed.
            });
        }
    };
}
