// Types

// Args builders & download preamble
export {
    parsePlannedFilenameFromPrintStdout,
    resolveYoutubeCookieArgvForDownload,
    resolveYoutubeDownloadPreamble,
    YT_DLP_SIMULATE_PROBE_PREFIX,
    youtubeDownloadPreambleCookieSegmentStart
} from './argsBuilders';
// Error classification
export {
    classifyMetadataResolveStderr,
    getErrorMessage,
    inferMetadataAuthReason,
    shouldRetryWithCookies,
    shouldRetryWithoutCookies
} from './errorClassification';
// Format normalization
export { normalizeFormats } from './formatNormalization';

// JSON parsing
export {
    coercePositiveByteCount,
    parseMetadataJson,
    parsePlaylistMetadataJson
} from './jsonParsing';
// Playlist entries
export {
    isInaccessiblePlaylistEntry,
    normalizeOnePlaylistEntry,
    normalizePlaylistEntries,
    youtubeVideoThumbnailFallback
} from './playlistEntries';
// Resolve
export {
    buildPlaylistInfoFromFlatRaw,
    fetchMetadata,
    fetchPlaylistInfo,
    MAX_RESOLVE_CANDIDATES,
    pickYtDlpExtractorKey,
    resolveMediaUrlMetadata,
    YOUTUBE_UU_UPLOADS_PLAYLIST_LOOKUP_RE
} from './resolve';
// Streaming playlist
export {
    derivePlaylistTitleFromRollingMeta,
    ingestFlatPlaylistDumpJsonLine,
    streamFetchPlaylistInfo
} from './streamingPlaylist';
// Thumbnails
export {
    getThumbnailUrl,
    normalizeThumbnailDisplayUrl,
    PREVIEW_THUMB_MAX_DIM,
    pickPreviewThumbnailUrlFromEntries,
    youtubeMetadataWantsYtdlpThumbnail
} from './thumbnails';
export type {
    BuiltArgsResult,
    EmbeddedThumbnailEvent,
    FetchMetadataOptions,
    MetadataArgsBuilder,
    SiteCookiesPathGetter,
    YoutubeDownloadPreambleParams,
    YtDlpFormat,
    YtDlpMetadata,
    YtDlpPlaylistEntry,
    YtDlpPlaylistMetadata
} from './types';
// yt-dlp process management
export { killPlaylistInfoStream } from './ytdlpProcess';
