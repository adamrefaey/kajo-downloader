/**
 * Single source of truth for IPC channel names (invoke + main→renderer push).
 * Preload, main handlers, and services must import from here — no string literals.
 */

export const IPC_INVOKE = {
    downloadFetchVideoInfo: 'download:fetch-video-info',
    downloadFetchPlaylistInfo: 'download:fetch-playlist-info',
    downloadPlaylistStreamStart: 'download:playlist-stream:start',
    downloadPlaylistStreamCancel: 'download:playlist-stream:cancel',
    downloadMetadataResolveUrl: 'download:metadata-resolve-url',
    downloadStart: 'download:start',
    downloadCancel: 'download:cancel',
    downloadPreparePlaylistOutputDir: 'download:prepare-playlist-output-dir',
    downloadPrepareChannelOutputDir: 'download:prepare-channel-output-dir',
    downloadCleanupArtifacts: 'download:cleanup-artifacts',
    downloadCleanupEmptyBatchDirs: 'download:cleanup-empty-batch-dirs',
    downloadCheckFilePaths: 'download:check-file-paths',
    downloadPause: 'download:pause',
    downloadResume: 'download:resume',
    downloadHistoryList: 'download:history:list',
    downloadHistoryClear: 'download:history:clear',
    downloadHistoryTotal: 'download:history:total',
    settingsSelectOutputFolder: 'settings:select-output-folder',
    settingsGet: 'settings:get',
    settingsSet: 'settings:set',
    settingsGetSystemLocale: 'settings:get-system-locale',
    settingsProxySetProfileUrl: 'settings:proxy:set-profile-url',
    setupCheck: 'setup:check',
    setupInstallYtdlp: 'setup:install-ytdlp',
    authOpenExternal: 'auth:open-external',
    siteAuthOpen: 'site-auth:open',
    siteAuthClose: 'site-auth:close',
    siteAuthSetBounds: 'site-auth:set-bounds',
    siteAuthGoBack: 'site-auth:go-back',
    siteAuthGoForward: 'site-auth:go-forward',
    siteAuthReload: 'site-auth:reload',
    siteAuthSave: 'site-auth:save',
    siteAuthListSignedSites: 'site-auth:list-signed-sites',
    siteAuthValidateSignedSite: 'site-auth:validate-signed-site',
    siteAuthClearSignedSite: 'site-auth:clear-signed-site',
    searchGetUsage: 'search:get-usage',
    youtubeSearch: 'youtube:search',
    localFilesOpenPath: 'local-files:open-path',
    localFilesRevealPath: 'local-files:reveal-path',
    appReportRendererError: 'app:report-renderer-error'
} as const;

/** Channels where the main process pushes one-way updates to the renderer. */
export const IPC_MAIN_TO_RENDERER = {
    downloadProgress: 'download:progress',
    downloadComplete: 'download:complete',
    downloadError: 'download:error',
    /** Main pushes authoritative state transitions for a download (e.g. pause, resume confirmed). */
    downloadStateChange: 'download:state-change',
    downloadPlaylistStreamProgress: 'download:playlist-stream:progress',
    downloadVideoThumbnail: 'download:video-thumbnail',
    appClipboardUrlDetected: 'app:clipboard:url-detected',
    setupLog: 'setup:log',
    setupComplete: 'setup:complete',
    siteAuthLoading: 'site-auth:loading',
    siteAuthUrlState: 'site-auth:url-state',
    siteAuthNavBlocked: 'site-auth:nav-blocked',
    siteAuthCookieRefresh: 'site-auth:cookie-refresh'
} as const;
