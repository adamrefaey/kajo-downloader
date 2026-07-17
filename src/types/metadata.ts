/** yt-dlp format row normalized for the quality picker. */
export interface Format {
    id: string;
    ext: string;
    resolution: string;
    formatNote?: string;
    vcodec?: string;
    acodec?: string;
    fps?: number;
    filesize?: number | null;
    /** Video-only byte estimate before +bestaudio merge (for combined progress). */
    filesizeVideoOnly?: number | null;
    audioOnly?: boolean;
    /** yt-dlp-reported audio bitrate (kbps) for audio-only rows; used to pair DASH video with a matching audio tier. */
    audioBitrateKbps?: number;
}

export interface VideoInfo {
    id: string;
    url: string;
    title: string;
    channel: string;
    durationSeconds: number;
    thumbnailUrl: string;
    formats: Format[];
}

/**
 * How the multi-item URL was classified for UI and telemetry (playlist, channel, profile, etc.).
 */
export type MediaCandidateCollectionKind = 'playlist' | 'channel' | 'profile' | 'tab' | 'unknown';

/**
 * URL handling before yt-dlp runs: one video vs multi-item container vs unusable path.
 */
export type UrlCandidateMode = 'single' | 'multi' | 'unsupported';

/** YouTube channel tab a flat entry was taken from (merged channel batch picker). */
export type YoutubeChannelSectionTab = 'videos' | 'shorts' | 'live';

/**
 * One downloadable item from a multi-item URL (playlist, channel tab, profile, multi-post, etc.).
 * Normalized from yt-dlp flat entries across extractors.
 */
export interface MediaCandidate {
    id: string;
    /** Canonical watch/page URL to pass to yt-dlp. */
    url: string;
    title: string;
    /** Channel name, uploader, or account — site-neutral creator label. */
    author: string;
    durationSeconds: number;
    thumbnailUrl: string;
    /** Index in yt-dlp’s flat `entries` list (0-based), including skipped rows. */
    flatIndex: number;
    /** Per-entry extractor key when yt-dlp provides it. */
    extractorKey?: string | undefined;
    /** yt-dlp availability when present (e.g. public, private). */
    availability?: string | null | undefined;
    /** When merging channel tabs for the batch picker, which tab this row came from. */
    channelSection?: YoutubeChannelSectionTab | undefined;
    /** yt-dlp playlist id for the source list (uploads UU…, shorts tab, streams tab, etc.). */
    sourcePlaylistId?: string | undefined;
    /** When yt-dlp flat JSON includes a byte estimate for this row (preferred over duration-only guess). */
    playlistEntryFilesizeBytes?: number | undefined;
    /**
     * yt-dlp live status from the flat playlist entry.
     * Live/past-live streams ('is_live' | 'was_live' | 'post_live') have unreliable filesize
     * estimates and suppress both filesize_approx and duration-based fallback estimation.
     */
    liveStatus?: string | null | undefined;
}

/**
 * Alias for {@link MediaCandidate} — playlist/channel/profile rows after yt-dlp flat normalization.
 */
export type NormalizedMediaCandidate = MediaCandidate;

export interface PlaylistInfo {
    id?: string | undefined;
    title: string;
    /** Present when yt-dlp includes channel / uploader on the playlist shell. */
    channel?: string | undefined;
    entries: MediaCandidate[];
    /** Input URL this collection was fetched for (user paste or resolved lookup). */
    sourceUrl?: string | undefined;
    collectionKind?: MediaCandidateCollectionKind | undefined;
}

/** Main → renderer progress while a flat playlist is enumerated via yt-dlp line streaming. */
export type PlaylistInfoStreamIpcEvent =
    | {
          kind: 'meta';
          title?: string | undefined;
          channel?: string | undefined;
          id?: string | undefined;
      }
    | { kind: 'entries'; entries: MediaCandidate[] }
    | { kind: 'done' }
    | { kind: 'error'; message: string };

/** IPC result envelope from main-process metadata fetches. */
export interface MediaLookupResult<T> {
    data: T | null;
    error?: string | undefined;
}

/** Coarse reason for `auth-required` resolves (drives copy and sign-in UX). */
export type MetadataAuthReason =
    | 'cookies_missing'
    | 'login_required'
    | 'private_or_members'
    | 'age_or_bot_check'
    | 'unknown';

/** Shared fields from URL + yt-dlp classify probe (IPC resolve payload). */
export interface MetadataResolveContextFields {
    /** Rollout profile id, or `ytdlp-generic` when yt-dlp matched an extractor outside rollout profiles. */
    siteId?: string | undefined;
    siteDomain?: string | undefined;
    extractorKey?: string | undefined;
    candidateMode: UrlCandidateMode;
    youtubeBatchKind?: 'playlist' | 'channel' | undefined;
    /** Site profile indicates cookie / sign-in flows are common for this host. */
    authCookiesRecommended?: boolean | undefined;
}

/**
 * yt-dlp-backed resolution for a pasted URL (preview / queue routing).
 * - `single` / `multi`: extraction looks viable; multi includes flat entry count from the first probe.
 * - `auth-required`: cookies or site login are needed (see `message`).
 * - `unsupported`: no extractor, invalid media URL, or other non-actionable failure.
 * - `blocked`: geo / DRM / copyright-style restriction (see `reason`).
 */
export type MetadataResolveResult =
    | ({ kind: 'single'; url: string } & MetadataResolveContextFields)
    | ({
          kind: 'multi';
          url: string;
          entryCount: number;
          /** Normalized flat rows (capped server-side for payload size). */
          candidates?: NormalizedMediaCandidate[] | undefined;
          /**
           * YouTube playlist URLs: full flat payload may be reused when opening the batch picker.
           * Channel URLs use a capped resolve probe; the picker loads uploads/shorts/live in parallel instead.
           */
          youtubePrefetchedUploadsPlaylist?: PlaylistInfo | undefined;
          /**
           * Watch URL also names a playlist (`list=`). User must choose single video vs playlist batch.
           */
          youtubeWatchPlaylistFork?: { singleVideoUrl: string } | undefined;
      } & MetadataResolveContextFields)
    | ({
          kind: 'auth-required';
          url: string;
          message?: string | undefined;
          authReason?: MetadataAuthReason | undefined;
          /** Same as `message` when present; kept for explicit UI/detail slots. */
          authDetail?: string | undefined;
          /** Page to open in the embedded sign-in browser (typically `origin` of the media URL). */
          signInTargetUrl?: string | undefined;
          /** Profile display name when the host maps to a known site. */
          siteDisplayName?: string | undefined;
      } & MetadataResolveContextFields)
    | ({
          kind: 'unsupported';
          url: string;
          message?: string | undefined;
      } & MetadataResolveContextFields)
    | ({ kind: 'blocked'; url: string; reason: string } & MetadataResolveContextFields);
