import {
    type AdvancedDownloadDefaultsPatch,
    advancedDownloadDefaultsToCapabilities,
    mergeDownloadCapabilityLayers,
    normalizeAdvancedDownloadDefaults
} from '../../src/shared/advancedDownloadSettings';
import { SECTION_TRIM_TIMESTAMP_RE } from '../../src/shared/sectionTrim';
import type {
    AdvancedDownloadDefaults,
    AudioOutputFormat,
    DownloadEngineCapabilities,
    SponsorBlockCategory,
    VideoContainer
} from '../../src/types';

const SUBTITLE_MODES = new Set(['off', 'sidecar', 'embed']);
const VIDEO_CONTAINERS = new Set<VideoContainer>(['mp4', 'mkv', 'webm']);
const AUDIO_FORMATS = new Set<AudioOutputFormat>(['mp3', 'm4a', 'flac', 'wav', 'aac', 'ogg']);

const SPONSOR_MODES = new Set(['off', 'mark', 'remove']);

const SPONSOR_BLOCK_CATEGORIES = new Set<string>([
    'sponsor',
    'intro',
    'outro',
    'selfpromo',
    'preview',
    'filler',
    'interaction',
    'music_offtopic',
    'poi_highlight',
    'chapter'
]);

/** yt-dlp `--limit-rate`: digits with optional decimal + optional K/M/G suffix, max length. */
const RATE_LIMIT_RE = /^\d+(\.\d+)?[KMGkmg]?$/;

/** yt-dlp `-o` template basename fragment: no path separators or traversal. */
const MAX_FILENAME_TEMPLATE_LEN = 200;

/** yt-dlp `--limit-rate`: digits with optional decimal + optional K/M/G suffix, max length. */
export function validateRateLimitString(raw: string): string | undefined {
    const t = raw.trim().slice(0, 16);
    if (!t || t.length > 16) {
        return undefined;
    }
    if (!RATE_LIMIT_RE.test(t)) {
        return undefined;
    }
    return t;
}

export function validateTrimTimestamp(raw: string): string | undefined {
    const t = raw.trim();
    if (!t || t.length > 24) {
        return undefined;
    }
    if (!SECTION_TRIM_TIMESTAMP_RE.test(t)) {
        return undefined;
    }
    return t;
}

/**
 * Validates yt-dlp output template string (single path segment under output dir).
 * Rejects `..`, slashes, and control characters.
 */
export function validateOutputFilenameTemplate(raw: string): string | undefined {
    const t = raw.trim();
    if (!t || t.length > MAX_FILENAME_TEMPLATE_LEN) {
        return undefined;
    }
    if (
        t.includes('..') ||
        t.includes('/') ||
        t.includes('\\') ||
        t.includes('\u0000') ||
        t.startsWith('~')
    ) {
        return undefined;
    }
    return t;
}

export function sanitizeSponsorBlockCategories(raw: unknown, max = 12): SponsorBlockCategory[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: SponsorBlockCategory[] = [];
    for (const x of raw) {
        if (typeof x !== 'string') {
            continue;
        }
        const k = x.trim().toLowerCase();
        if (SPONSOR_BLOCK_CATEGORIES.has(k) && !out.includes(k as SponsorBlockCategory)) {
            out.push(k as SponsorBlockCategory);
        }
        if (out.length >= max) {
            break;
        }
    }
    return out;
}

export interface ApplyStructuredCapabilitiesContext {
    /** Resolved from proxy profile store when `capabilities.proxy.enabled`. */
    resolvedProxyUrl?: string | null;
    /** App-managed archive file when `capabilities.archive.enabled`. */
    resolvedArchivePath?: string | null;
}

/**
 * Appends yt-dlp argv from validated capabilities (main process only).
 */
export function applyStructuredDownloadCapabilities(
    args: string[],
    capabilities: DownloadEngineCapabilities | undefined,
    ctx?: ApplyStructuredCapabilitiesContext
): void {
    if (!capabilities) {
        return;
    }

    const sb = capabilities.sponsorblock;
    if (sb && sb.mode !== 'off') {
        const cats = (sb.categories && sb.categories.length > 0 ? sb.categories : ['sponsor']).join(
            ','
        );
        if (sb.mode === 'mark') {
            args.push('--sponsorblock-mark', cats);
        } else if (sb.mode === 'remove') {
            args.push('--sponsorblock-remove', cats);
        }
    }

    const tr = capabilities.trim;
    if (tr?.start && tr.end) {
        const a = validateTrimTimestamp(tr.start);
        const b = validateTrimTimestamp(tr.end);
        if (a && b) {
            args.push('--download-sections', `*${a}-${b}`);
        }
    }

    if (capabilities.archive?.enabled === true && ctx?.resolvedArchivePath) {
        args.push('--download-archive', ctx.resolvedArchivePath);
    }

    const sub = capabilities.subtitles;
    if (sub && sub.mode !== 'off') {
        args.push('--write-subs');
        if (sub.languages && sub.languages.length > 0) {
            args.push('--sub-langs', sub.languages.join(','));
        }
        if (sub.mode === 'embed') {
            args.push('--embed-subs');
        }
    }

    const emb = capabilities.embedding;
    if (emb) {
        if (emb.metadata === true) {
            args.push('--embed-metadata');
        }
        if (emb.thumbnail === true) {
            args.push('--embed-thumbnail');
        }
        if (emb.chapters === true) {
            args.push('--embed-chapters');
        }
    }

    const net = capabilities.network?.rateLimit;
    const rate = net ? validateRateLimitString(net) : undefined;
    if (rate) {
        args.push('--limit-rate', rate);
    }

    if (capabilities.proxy?.enabled === true && ctx?.resolvedProxyUrl) {
        args.push('--proxy', ctx.resolvedProxyUrl);
    }
}

/**
 * Validates renderer-supplied download capability flags. CLI args are derived only in main from this shape.
 */
export function sanitizeDownloadEngineCapabilities(
    raw: unknown
): DownloadEngineCapabilities | undefined {
    if (raw == null || typeof raw !== 'object') {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    const out: DownloadEngineCapabilities = {};

    if (r.sponsorblock != null && typeof r.sponsorblock === 'object') {
        const s = r.sponsorblock as Record<string, unknown>;
        const mode = s.mode;
        if (typeof mode === 'string' && SPONSOR_MODES.has(mode) && mode !== 'off') {
            const cats = sanitizeSponsorBlockCategories(s.categories);
            out.sponsorblock = {
                mode: mode as 'mark' | 'remove',
                categories: cats.length > 0 ? cats : ['sponsor']
            };
        } else if (mode === 'off') {
            out.sponsorblock = { mode: 'off', categories: [] };
        }
    }

    if (r.trim != null && typeof r.trim === 'object') {
        const t = r.trim as Record<string, unknown>;
        const start = typeof t.start === 'string' ? validateTrimTimestamp(t.start) : undefined;
        const end = typeof t.end === 'string' ? validateTrimTimestamp(t.end) : undefined;
        if (start && end) {
            out.trim = { start, end };
        }
    }

    if (r.archive != null && typeof r.archive === 'object') {
        const a = r.archive as Record<string, unknown>;
        if (a.enabled === true) {
            out.archive = { enabled: true };
        }
    }

    if (r.subtitles != null && typeof r.subtitles === 'object') {
        const s = r.subtitles as Record<string, unknown>;
        const mode = s.mode;
        if (typeof mode === 'string' && SUBTITLE_MODES.has(mode)) {
            const block: DownloadEngineCapabilities['subtitles'] = {
                mode: mode as 'off' | 'sidecar' | 'embed'
            };
            if (Array.isArray(s.languages)) {
                const langs = s.languages
                    .filter((x): x is string => typeof x === 'string')
                    .map((l) => l.trim().slice(0, 16))
                    .filter(Boolean)
                    .slice(0, 32);
                if (langs.length > 0) {
                    block.languages = langs;
                }
            }
            out.subtitles = block;
        }
    }

    if (r.embedding != null && typeof r.embedding === 'object') {
        const e = r.embedding as Record<string, unknown>;
        const emb: NonNullable<DownloadEngineCapabilities['embedding']> = {};
        if (e.metadata === true) {
            emb.metadata = true;
        }
        if (e.thumbnail === true) {
            emb.thumbnail = true;
        }
        if (e.chapters === true) {
            emb.chapters = true;
        }
        if (Object.keys(emb).length > 0) {
            out.embedding = emb;
        }
    }

    if (r.output != null && typeof r.output === 'object') {
        const o = r.output as Record<string, unknown>;
        const output: NonNullable<DownloadEngineCapabilities['output']> = {};
        if (
            typeof o.videoContainer === 'string' &&
            VIDEO_CONTAINERS.has(o.videoContainer as VideoContainer)
        ) {
            output.videoContainer = o.videoContainer as VideoContainer;
        }
        if (
            typeof o.audioFormat === 'string' &&
            AUDIO_FORMATS.has(o.audioFormat as AudioOutputFormat)
        ) {
            output.audioFormat = o.audioFormat as AudioOutputFormat;
        }
        if (Object.keys(output).length > 0) {
            out.output = output;
        }
    }

    if (r.network != null && typeof r.network === 'object') {
        const n = r.network as Record<string, unknown>;
        if (typeof n.rateLimit === 'string') {
            const rate = validateRateLimitString(n.rateLimit);
            if (rate) {
                out.network = { rateLimit: rate };
            }
        }
    }

    if (r.proxy != null && typeof r.proxy === 'object') {
        const p = r.proxy as Record<string, unknown>;
        if (p.enabled === true) {
            const profileId =
                typeof p.profileId === 'string' && p.profileId.trim().length > 0
                    ? p.profileId.trim().slice(0, 64)
                    : undefined;
            out.proxy = profileId ? { enabled: true, profileId } : { enabled: true };
        }
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Merge settings-derived defaults with an optional per-start IPC overlay (before proxy resolution).
 */
export function mergeAdvancedStartCapabilities(
    advancedDefaults: AdvancedDownloadDefaults,
    sanitizedOverlay: DownloadEngineCapabilities | undefined
): DownloadEngineCapabilities | undefined {
    const base = advancedDownloadDefaultsToCapabilities(advancedDefaults);
    const merged = mergeDownloadCapabilityLayers(base, sanitizedOverlay);
    return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Metadata, thumbnail, and chapters are always embedded when supported (no user toggle). */
const AUTOMATIC_FILE_EMBEDDING: DownloadEngineCapabilities = {
    embedding: { metadata: true, thumbnail: true, chapters: true }
};

export function mergeWithAutomaticFileEmbedding(
    caps: DownloadEngineCapabilities | undefined
): DownloadEngineCapabilities {
    return mergeDownloadCapabilityLayers(caps ?? {}, AUTOMATIC_FILE_EMBEDDING);
}

/**
 * Normalizes merged capabilities for argv mapping: returns undefined when there
 * are no capabilities to apply, otherwise the merged object unchanged.
 */
export function normalizeMergedCapabilities(
    merged: DownloadEngineCapabilities | undefined
): DownloadEngineCapabilities | undefined {
    if (!merged || Object.keys(merged).length === 0) {
        return undefined;
    }
    return merged;
}

/**
 * Resolves proxy + optional download-archive paths for argv mapping.
 */
export function buildApplyCapabilitiesContext(
    capabilities: DownloadEngineCapabilities | undefined,
    getProxyUrl: (profileId: string) => string | null,
    resolvedArchivePath?: string | null
): ApplyStructuredCapabilitiesContext {
    const ctx: ApplyStructuredCapabilitiesContext = {};
    if (capabilities?.proxy?.enabled) {
        const id = capabilities.proxy.profileId?.trim() || 'default';
        ctx.resolvedProxyUrl = getProxyUrl(id);
    }
    if (capabilities?.archive?.enabled === true && resolvedArchivePath) {
        ctx.resolvedArchivePath = resolvedArchivePath;
    }
    return ctx;
}

/** Partial patch from renderer `set-settings` for `advancedDownloadDefaults`. */
export function sanitizeAdvancedDownloadDefaultsPatch(
    raw: unknown
): AdvancedDownloadDefaultsPatch | undefined {
    if (raw == null || typeof raw !== 'object') {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    const patch: AdvancedDownloadDefaultsPatch = {};

    if (r.subtitles != null && typeof r.subtitles === 'object') {
        const s = r.subtitles as Record<string, unknown>;
        const sub: NonNullable<AdvancedDownloadDefaultsPatch['subtitles']> = {};
        if (typeof s.mode === 'string' && SUBTITLE_MODES.has(s.mode)) {
            sub.mode = s.mode as AdvancedDownloadDefaults['subtitles']['mode'];
        }
        if (Array.isArray(s.languages)) {
            sub.languages = s.languages
                .filter((x): x is string => typeof x === 'string')
                .map((l) => l.trim().slice(0, 16))
                .filter(Boolean)
                .slice(0, 32);
        }
        if (Object.keys(sub).length > 0) {
            patch.subtitles = sub;
        }
    }

    if (r.output != null && typeof r.output === 'object') {
        const o = r.output as Record<string, unknown>;
        const out: NonNullable<AdvancedDownloadDefaultsPatch['output']> = {};
        if (
            typeof o.videoContainer === 'string' &&
            VIDEO_CONTAINERS.has(o.videoContainer as VideoContainer)
        ) {
            out.videoContainer = o.videoContainer as VideoContainer;
        }
        if (
            typeof o.audioFormat === 'string' &&
            AUDIO_FORMATS.has(o.audioFormat as AudioOutputFormat)
        ) {
            out.audioFormat = o.audioFormat as AudioOutputFormat;
        }
        if (Object.keys(out).length > 0) {
            patch.output = out;
        }
    }

    if (r.network != null && typeof r.network === 'object') {
        const n = r.network as Record<string, unknown>;
        if (typeof n.rateLimit === 'string') {
            patch.network = { rateLimit: n.rateLimit.trim().slice(0, 24) };
        }
    }

    if (r.proxy != null && typeof r.proxy === 'object') {
        const p = r.proxy as Record<string, unknown>;
        const px: NonNullable<AdvancedDownloadDefaultsPatch['proxy']> = {};
        if (p.enabled === true || p.enabled === false) {
            px.enabled = p.enabled;
        }
        if (typeof p.profileId === 'string' && p.profileId.trim().length > 0) {
            px.profileId = p.profileId.trim().slice(0, 64);
        }
        if (Object.keys(px).length > 0) {
            patch.proxy = px;
        }
    }

    if (r.sponsorblock != null && typeof r.sponsorblock === 'object') {
        const s = r.sponsorblock as Record<string, unknown>;
        const sb: NonNullable<AdvancedDownloadDefaultsPatch['sponsorblock']> = {};
        if (typeof s.mode === 'string' && SPONSOR_MODES.has(s.mode)) {
            sb.mode = s.mode as AdvancedDownloadDefaults['sponsorblock']['mode'];
        }
        if (Array.isArray(s.categories)) {
            sb.categories = sanitizeSponsorBlockCategories(s.categories);
        }
        if (Object.keys(sb).length > 0) {
            patch.sponsorblock = sb;
        }
    }

    if (r.archive != null && typeof r.archive === 'object') {
        const a = r.archive as Record<string, unknown>;
        if (a.enabled === true || a.enabled === false) {
            patch.archive = { enabled: a.enabled };
        }
    }

    if (typeof r.filenameTemplate === 'string') {
        const v = validateOutputFilenameTemplate(r.filenameTemplate);
        if (v) {
            patch.filenameTemplate = v;
        }
    }

    return Object.keys(patch).length > 0 ? patch : undefined;
}

export function mergeAdvancedDownloadDefaultsStored(
    previous: unknown,
    patch: AdvancedDownloadDefaultsPatch
): AdvancedDownloadDefaults {
    const base = normalizeAdvancedDownloadDefaults(previous);
    return {
        subtitles: {
            mode: patch.subtitles?.mode ?? base.subtitles.mode,
            languages: patch.subtitles?.languages ?? base.subtitles.languages
        },
        output: {
            videoContainer: patch.output?.videoContainer ?? base.output.videoContainer,
            audioFormat: patch.output?.audioFormat ?? base.output.audioFormat
        },
        network: {
            rateLimit: patch.network?.rateLimit ?? base.network.rateLimit
        },
        proxy: {
            enabled: patch.proxy?.enabled ?? base.proxy.enabled,
            profileId: patch.proxy?.profileId ?? base.proxy.profileId
        },
        sponsorblock: {
            mode: patch.sponsorblock?.mode ?? base.sponsorblock.mode,
            categories:
                patch.sponsorblock?.categories !== undefined
                    ? sanitizeSponsorBlockCategories(patch.sponsorblock.categories)
                    : base.sponsorblock.categories
        },
        archive: {
            enabled: patch.archive?.enabled ?? base.archive.enabled
        },
        filenameTemplate: patch.filenameTemplate ?? base.filenameTemplate
    };
}
