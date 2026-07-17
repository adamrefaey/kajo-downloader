import {
    inferMediaCandidateCollectionKind,
    parseHttpMediaUrl
} from '../../../src/shared/mediaUrlResolver';
import {
    isProhibitedAdultMediaUrl,
    PROHIBITED_ADULT_CONTENT_REASON
} from '../../../src/shared/prohibitedAdultContentHosts';
import {
    getSiteProfileByHostOrUrl,
    getSiteProfileBySiteId
} from '../../../src/shared/siteProfiles';
import {
    buildStaticMetadataResolveContext,
    refineMetadataResolveContextWithExtractor
} from '../../../src/shared/urlSiteResolveContext';
import { resolveYoutubeFlatPlaylistLookupUrl } from '../../../src/shared/youtubeFlatPlaylistUrl';
import { tryYoutubeWatchPlaylistFork } from '../../../src/shared/youtubeWatchPlaylistFork';
import type {
    MetadataResolveContextFields,
    MetadataResolveResult,
    PlaylistInfo,
    VideoInfo
} from '../../../src/types';
import { mainLog } from '../../mainLogger';
import { isYoutubeUrl } from '../youtubeYtdlpDefaults';
import {
    buildMetadataArgs,
    buildPlaylistMetadataArgs,
    buildYoutubeChannelFastPlaylistMetadataArgs
} from './argsBuilders';
import {
    classifyMetadataResolveStderr,
    getErrorMessage,
    inferMetadataAuthReason,
    pickCanonicalMediaUrl,
    shouldBlockSingleVideoFallbackAfterFlatFailure,
    tryHttpsOriginForSignIn
} from './errorClassification';
import { normalizeFormats } from './formatNormalization';
import { parseMetadataJson, parsePlaylistMetadataJson } from './jsonParsing';
import { normalizePlaylistEntries } from './playlistEntries';
import {
    getThumbnailUrl,
    tryFetchThumbnailDataUrlViaYtdlpWrite,
    tryFetchYoutubeThumbnailDataUrl,
    youtubeMetadataWantsYtdlpThumbnail
} from './thumbnails';
import type { FetchMetadataOptions, YtDlpMetadata, YtDlpPlaylistMetadata } from './types';
import { runYtDlpWithAuthCookieStrategies } from './ytdlpProcess';

export async function fetchMetadata(
    url: string,
    options: FetchMetadataOptions = {}
): Promise<VideoInfo> {
    if (!parseHttpMediaUrl(url)) {
        throw new Error('URL must be http or https');
    }
    if (isProhibitedAdultMediaUrl(url)) {
        throw new Error(PROHIBITED_ADULT_CONTENT_REASON);
    }
    const { stdout, stderr, exitCode } = await runYtDlpWithAuthCookieStrategies(
        url,
        options,
        buildMetadataArgs
    );

    if (exitCode !== 0) {
        throw new Error(getErrorMessage(stderr, exitCode));
    }

    const raw = parseMetadataJson(stdout);
    const formats = normalizeFormats(raw.formats ?? [], raw.duration ?? null);

    if (!raw.id || !raw.title) {
        throw new Error('yt-dlp returned incomplete metadata');
    }

    const videoId = raw.id;
    const canonicalPageUrl = raw.webpage_url ?? raw.original_url ?? url;

    let thumbnailUrl = getThumbnailUrl(raw);
    if (isYoutubeUrl(url) && youtubeMetadataWantsYtdlpThumbnail(raw, thumbnailUrl)) {
        if (options.onEmbeddedThumbnail) {
            // CDN URLs often 403 or show placeholders for private/auth videos; avoid a broken <img> until
            // yt-dlp writes an authenticated thumbnail and we push it via IPC.
            thumbnailUrl = '';
            void tryFetchYoutubeThumbnailDataUrl(url, options, videoId, raw)
                .then((embedded) => {
                    if (embedded) {
                        options.onEmbeddedThumbnail?.({
                            videoId,
                            thumbnailUrl: embedded,
                            mediaPageUrl: canonicalPageUrl
                        });
                    }
                })
                .catch((e: unknown) => {
                    mainLog.warn('youtube thumbnail data-url fetch failed', { error: String(e) });
                });
        } else {
            const embedded = await tryFetchYoutubeThumbnailDataUrl(url, options, videoId, raw);
            if (embedded) {
                thumbnailUrl = embedded;
            }
        }
    } else if (
        options.onEmbeddedThumbnail &&
        !isYoutubeUrl(url) &&
        thumbnailUrl.trim() &&
        !thumbnailUrl.startsWith('data:') &&
        /^https?:\/\//i.test(thumbnailUrl)
    ) {
        // Many sites serve thumbs that fail inside Electron <img> (hotlink rules, cookies, odd TLS). Fetch
        // the same file yt-dlp would embed so the UI always gets a data: URL that bypasses renderer fetches.
        void tryFetchThumbnailDataUrlViaYtdlpWrite(canonicalPageUrl, options, videoId)
            .then((embedded) => {
                if (embedded) {
                    options.onEmbeddedThumbnail?.({
                        videoId,
                        thumbnailUrl: embedded,
                        mediaPageUrl: canonicalPageUrl
                    });
                }
            })
            .catch((e: unknown) => {
                mainLog.warn('yt-dlp thumbnail data-url write fetch failed', { error: String(e) });
            });
    }

    return {
        id: raw.id,
        url: canonicalPageUrl,
        title: raw.title,
        channel: raw.channel ?? raw.uploader ?? 'Unknown channel',
        durationSeconds: Math.max(0, Math.floor(raw.duration ?? 0)),
        thumbnailUrl,
        formats
    };
}

/** Builds {@link PlaylistInfo} from yt-dlp `--dump-single-json` playlist payload (flat or full). */
export function buildPlaylistInfoFromFlatRaw(
    raw: YtDlpPlaylistMetadata,
    lookupUrl: string,
    sourceUrl: string
): PlaylistInfo {
    const entries = normalizePlaylistEntries(raw.entries ?? [], lookupUrl);
    let title =
        raw.playlist_title?.trim() ||
        raw.title?.trim() ||
        raw.channel?.trim() ||
        raw.uploader?.trim();

    if (title && /^uploads from /i.test(title) && raw.channel?.trim()) {
        title = raw.channel.trim();
    }

    if (!title) {
        throw new Error('yt-dlp returned incomplete playlist metadata');
    }

    const channel = raw.channel?.trim() || raw.uploader?.trim();
    const trimmedSource = sourceUrl.trim();

    return {
        id: raw.id?.trim() || undefined,
        title,
        channel: channel || undefined,
        entries,
        sourceUrl: trimmedSource,
        collectionKind: inferMediaCandidateCollectionKind(trimmedSource)
    };
}

export const YOUTUBE_UU_UPLOADS_PLAYLIST_LOOKUP_RE: RegExp =
    /^https:\/\/www\.youtube\.com\/playlist\?list=UU[a-zA-Z0-9_-]+$/i;

export function tryYoutubeChannelUploadsPrefetchFromResolve(
    raw: YtDlpPlaylistMetadata,
    lookupUrl: string,
    channelPageUrl: string,
    youtubeBatchKind: MetadataResolveContextFields['youtubeBatchKind']
): PlaylistInfo | undefined {
    if (youtubeBatchKind !== 'channel') {
        return undefined;
    }
    if (!YOUTUBE_UU_UPLOADS_PLAYLIST_LOOKUP_RE.test(lookupUrl.trim())) {
        return undefined;
    }
    if (lookupUrl !== resolveYoutubeFlatPlaylistLookupUrl(channelPageUrl)) {
        return undefined;
    }
    try {
        return buildPlaylistInfoFromFlatRaw(raw, lookupUrl, channelPageUrl);
    } catch {
        return undefined;
    }
}

export async function fetchPlaylistInfo(
    url: string,
    options: FetchMetadataOptions = {}
): Promise<PlaylistInfo> {
    if (!parseHttpMediaUrl(url)) {
        throw new Error('URL must be http or https');
    }
    if (isProhibitedAdultMediaUrl(url)) {
        throw new Error(PROHIBITED_ADULT_CONTENT_REASON);
    }
    const lookupUrl = resolveYoutubeFlatPlaylistLookupUrl(url);
    const { stdout, stderr, exitCode } = await runYtDlpWithAuthCookieStrategies(
        lookupUrl,
        options,
        buildPlaylistMetadataArgs
    );

    if (exitCode !== 0) {
        throw new Error(getErrorMessage(stderr, exitCode));
    }

    const raw = parsePlaylistMetadataJson(stdout);
    return buildPlaylistInfoFromFlatRaw(raw, lookupUrl, url);
}

export const MAX_RESOLVE_CANDIDATES = 500;

export function pickYtDlpExtractorKey(
    raw: Pick<YtDlpMetadata | YtDlpPlaylistMetadata, 'extractor_key' | 'extractor'>
): string | undefined {
    const k = raw.extractor_key?.trim() || raw.extractor?.trim();
    return k || undefined;
}

/**
 * Runs a flat-playlist JSON probe (plus optional single-video probe) and classifies the URL for UI routing.
 */
export async function resolveMediaUrlMetadata(
    url: string,
    options: FetchMetadataOptions = {}
): Promise<MetadataResolveResult> {
    const trimmed = url.trim();
    const staticCtx = buildStaticMetadataResolveContext(trimmed);

    if (!parseHttpMediaUrl(trimmed)) {
        return {
            kind: 'unsupported',
            url: trimmed,
            message: 'Invalid or non-http(s) URL',
            ...staticCtx
        };
    }

    if (isProhibitedAdultMediaUrl(trimmed)) {
        return {
            kind: 'blocked',
            url: trimmed,
            reason: PROHIBITED_ADULT_CONTENT_REASON,
            ...staticCtx
        };
    }

    const lookupUrl = resolveYoutubeFlatPlaylistLookupUrl(trimmed);
    /** Channel uploads and YouTube playlist/watch+list URLs: avoid a full flat dump during resolve (can hang on large lists). */
    const youtubeFastFlatPlaylistProbe =
        staticCtx.youtubeBatchKind === 'channel' || staticCtx.youtubeBatchKind === 'playlist';
    /** YouTube watch/shorts/youtu.be: flat `--dump-single-json` returns full video JSON with no `entries` — skip to a single `--dump-json` probe. */
    const skipFlatProbeForYoutubeSingleVideo =
        isYoutubeUrl(trimmed) &&
        staticCtx.youtubeBatchKind === undefined &&
        staticCtx.candidateMode !== 'multi';

    let flat: { stdout: string; stderr: string; exitCode: number | null } = {
        stdout: '',
        stderr: '',
        exitCode: null
    };

    if (!skipFlatProbeForYoutubeSingleVideo) {
        flat = await runYtDlpWithAuthCookieStrategies(
            lookupUrl,
            options,
            youtubeFastFlatPlaylistProbe
                ? buildYoutubeChannelFastPlaylistMetadataArgs
                : buildPlaylistMetadataArgs
        );

        if (flat.exitCode === 0) {
            try {
                const raw = parsePlaylistMetadataJson(flat.stdout);
                const entries = raw.entries ?? [];
                const ytKey = pickYtDlpExtractorKey(raw);
                const ctx = refineMetadataResolveContextWithExtractor(staticCtx, ytKey);
                if (entries.length > 1) {
                    const normalized = normalizePlaylistEntries(entries, lookupUrl);
                    const candidates =
                        normalized.length > MAX_RESOLVE_CANDIDATES
                            ? normalized.slice(0, MAX_RESOLVE_CANDIDATES)
                            : normalized;
                    const youtubePrefetchedUploadsPlaylist =
                        staticCtx.youtubeBatchKind === 'channel'
                            ? undefined
                            : tryYoutubeChannelUploadsPrefetchFromResolve(
                                  raw,
                                  lookupUrl,
                                  trimmed,
                                  staticCtx.youtubeBatchKind
                              );
                    const youtubeWatchPlaylistFork = tryYoutubeWatchPlaylistFork(trimmed);
                    return {
                        kind: 'multi',
                        url: trimmed,
                        entryCount: entries.length,
                        candidates,
                        ...(youtubePrefetchedUploadsPlaylist
                            ? { youtubePrefetchedUploadsPlaylist }
                            : {}),
                        ...(youtubeWatchPlaylistFork ? { youtubeWatchPlaylistFork } : {}),
                        ...ctx
                    };
                }
                if (entries.length === 1) {
                    const [entry] = entries;
                    if (entry) {
                        const canonical = pickCanonicalMediaUrl(
                            entry.webpage_url ?? entry.original_url ?? entry.url,
                            trimmed
                        );
                        return { kind: 'single', url: canonical, ...ctx };
                    }
                }
                if (entries.length === 0 && raw.id?.trim() && raw.title?.trim()) {
                    const canonical = pickCanonicalMediaUrl(
                        raw.webpage_url ?? raw.original_url,
                        trimmed
                    );
                    return { kind: 'single', url: canonical, ...ctx };
                }
            } catch {
                // fall through to single-video retry when allowed
            }
        }
    }

    let singleStderr = '';
    let singleExit: number | null = null;
    if (!shouldBlockSingleVideoFallbackAfterFlatFailure(trimmed, lookupUrl)) {
        const single = await runYtDlpWithAuthCookieStrategies(trimmed, options, buildMetadataArgs);
        singleStderr = single.stderr;
        singleExit = single.exitCode;
        if (single.exitCode === 0) {
            try {
                const meta = parseMetadataJson(single.stdout);
                if (meta.id && meta.title) {
                    const canonical = pickCanonicalMediaUrl(
                        meta.webpage_url ?? meta.original_url,
                        trimmed
                    );
                    const ytKey = pickYtDlpExtractorKey(meta);
                    const ctx = refineMetadataResolveContextWithExtractor(staticCtx, ytKey);
                    return { kind: 'single', url: canonical, ...ctx };
                }
            } catch {
                // classify failure below
            }
        }
    }

    const mergedStderr = [flat.stderr, singleStderr].filter(Boolean).join('\n');
    const exitForMessage = singleExit ?? flat.exitCode;
    const kind = classifyMetadataResolveStderr(mergedStderr);
    const msg = getErrorMessage(mergedStderr, exitForMessage);
    const failCtx = staticCtx;

    if (kind === 'auth-required') {
        const authReason = inferMetadataAuthReason(mergedStderr);
        const signInTargetUrl = tryHttpsOriginForSignIn(trimmed);
        const profile =
            (failCtx.siteId ? getSiteProfileBySiteId(failCtx.siteId) : undefined) ??
            getSiteProfileByHostOrUrl(trimmed);
        return {
            kind: 'auth-required',
            url: trimmed,
            message: msg,
            authReason,
            authDetail: msg,
            signInTargetUrl,
            siteDisplayName: profile?.displayName,
            ...failCtx
        };
    }
    if (kind === 'blocked') {
        return { kind: 'blocked', url: trimmed, reason: msg, ...failCtx };
    }
    return { kind: 'unsupported', url: trimmed, message: msg, ...failCtx };
}
