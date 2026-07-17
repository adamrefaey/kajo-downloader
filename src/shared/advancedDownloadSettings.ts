import type {
    AdvancedDownloadDefaults,
    DownloadEngineCapabilities,
    SponsorBlockCategory
} from '../types';
import { DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS as BASE_DEFAULTS } from '../types';

export { DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS } from '../types';

/** Partial patch accepted by settings UI and IPC `set-settings`. */
export type AdvancedDownloadDefaultsPatch = {
    subtitles?: Partial<AdvancedDownloadDefaults['subtitles']>;
    output?: Partial<AdvancedDownloadDefaults['output']>;
    network?: Partial<AdvancedDownloadDefaults['network']>;
    proxy?: Partial<AdvancedDownloadDefaults['proxy']>;
    sponsorblock?: Partial<AdvancedDownloadDefaults['sponsorblock']>;
    archive?: Partial<AdvancedDownloadDefaults['archive']>;
    filenameTemplate?: string;
};

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

function clampLangs(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw
        .filter((x): x is string => typeof x === 'string')
        .map((l) => l.trim().slice(0, 16))
        .filter(Boolean)
        .slice(0, 32);
}

function clampSponsorCats(raw: unknown): SponsorBlockCategory[] {
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
        if (out.length >= 12) {
            break;
        }
    }
    return out;
}

/**
 * Merge persisted partial advanced defaults with the baseline (for settings store migration).
 */
export function normalizeAdvancedDownloadDefaults(stored: unknown): AdvancedDownloadDefaults {
    const d = BASE_DEFAULTS;
    if (stored == null || typeof stored !== 'object') {
        return structuredClone(d);
    }
    const r = stored as Record<string, unknown>;

    const sub = r.subtitles != null && typeof r.subtitles === 'object' ? r.subtitles : {};
    const su = sub as Record<string, unknown>;
    const subMode =
        su.mode === 'off' || su.mode === 'sidecar' || su.mode === 'embed'
            ? su.mode
            : d.subtitles.mode;

    const out = r.output != null && typeof r.output === 'object' ? r.output : {};
    const o = out as Record<string, unknown>;
    const vc =
        o.videoContainer === 'mp4' || o.videoContainer === 'mkv' || o.videoContainer === 'webm'
            ? o.videoContainer
            : d.output.videoContainer;
    const af =
        o.audioFormat === 'mp3' ||
        o.audioFormat === 'm4a' ||
        o.audioFormat === 'flac' ||
        o.audioFormat === 'wav' ||
        o.audioFormat === 'aac' ||
        o.audioFormat === 'ogg'
            ? o.audioFormat
            : d.output.audioFormat;

    const net = r.network != null && typeof r.network === 'object' ? r.network : {};
    const n = net as Record<string, unknown>;
    const rateLimit =
        typeof n.rateLimit === 'string' ? n.rateLimit.trim().slice(0, 24) : d.network.rateLimit;

    const px = r.proxy != null && typeof r.proxy === 'object' ? r.proxy : {};
    const p = px as Record<string, unknown>;
    const profileId =
        typeof p.profileId === 'string' && p.profileId.trim().length > 0
            ? p.profileId.trim().slice(0, 64)
            : d.proxy.profileId;

    const sb = r.sponsorblock != null && typeof r.sponsorblock === 'object' ? r.sponsorblock : {};
    const sbs = sb as Record<string, unknown>;
    const sponsorMode =
        typeof sbs.mode === 'string' && SPONSOR_MODES.has(sbs.mode)
            ? sbs.mode
            : d.sponsorblock.mode;
    const sponsorCats = clampSponsorCats(sbs.categories);

    const ar = r.archive != null && typeof r.archive === 'object' ? r.archive : {};
    const aa = ar as Record<string, unknown>;
    const archiveEnabled = aa.enabled === true;

    let filenameTemplate = d.filenameTemplate;
    if (typeof r.filenameTemplate === 'string' && r.filenameTemplate.trim()) {
        const t = r.filenameTemplate.trim();
        if (
            t.length <= 200 &&
            !t.includes('..') &&
            !t.includes('/') &&
            !t.includes('\\') &&
            !t.includes('\u0000') &&
            !t.startsWith('~')
        ) {
            filenameTemplate = t;
        }
    }

    const langs = clampLangs(su.languages);

    return {
        subtitles: {
            mode: subMode,
            languages: langs.length > 0 ? langs : d.subtitles.languages
        },
        output: {
            videoContainer: vc,
            audioFormat: af
        },
        network: { rateLimit },
        proxy: {
            enabled: p.enabled === true,
            profileId
        },
        sponsorblock: {
            mode: sponsorMode as AdvancedDownloadDefaults['sponsorblock']['mode'],
            categories: sponsorCats.length > 0 ? sponsorCats : d.sponsorblock.categories
        },
        archive: {
            enabled: archiveEnabled
        },
        filenameTemplate
    };
}

/**
 * Maps persisted advanced settings → capability object for merging with per-download IPC overrides.
 */
export function advancedDownloadDefaultsToCapabilities(
    defaults: AdvancedDownloadDefaults
): DownloadEngineCapabilities {
    const out: DownloadEngineCapabilities = {};

    if (defaults.sponsorblock.mode !== 'off') {
        out.sponsorblock = {
            mode: defaults.sponsorblock.mode,
            categories:
                defaults.sponsorblock.categories.length > 0
                    ? [...defaults.sponsorblock.categories]
                    : ['sponsor']
        };
    }

    if (defaults.subtitles.mode !== 'off') {
        out.subtitles = {
            mode: defaults.subtitles.mode,
            languages:
                defaults.subtitles.languages.length > 0
                    ? [...defaults.subtitles.languages]
                    : undefined
        };
    }

    if (defaults.output.videoContainer !== 'mp4' || defaults.output.audioFormat !== 'mp3') {
        out.output = {};
        if (defaults.output.videoContainer !== 'mp4') {
            out.output.videoContainer = defaults.output.videoContainer;
        }
        if (defaults.output.audioFormat !== 'mp3') {
            out.output.audioFormat = defaults.output.audioFormat;
        }
        if (Object.keys(out.output).length === 0) {
            delete out.output;
        }
    }

    const rl = defaults.network.rateLimit.trim();
    if (rl.length > 0) {
        out.network = { rateLimit: rl };
    }

    if (defaults.proxy.enabled) {
        out.proxy = { enabled: true, profileId: defaults.proxy.profileId };
    }

    if (defaults.archive.enabled) {
        out.archive = { enabled: true };
    }

    return out;
}

/** Deep-merge capability objects (overlay wins). */
export function mergeDownloadCapabilityLayers(
    base: DownloadEngineCapabilities,
    overlay: DownloadEngineCapabilities | undefined
): DownloadEngineCapabilities {
    if (!overlay) {
        return { ...base };
    }
    const merged: DownloadEngineCapabilities = { ...base };

    if (overlay.sponsorblock) {
        merged.sponsorblock = { ...base.sponsorblock, ...overlay.sponsorblock };
    }

    if (overlay.trim) {
        merged.trim = { ...base.trim, ...overlay.trim };
    }

    if (overlay.archive) {
        merged.archive = { ...base.archive, ...overlay.archive };
    }

    if (overlay.subtitles) {
        merged.subtitles = {
            ...base.subtitles,
            ...overlay.subtitles,
            languages: overlay.subtitles.languages ?? base.subtitles?.languages
        };
    }

    if (overlay.embedding) {
        merged.embedding = { ...base.embedding, ...overlay.embedding };
    }

    if (overlay.output) {
        merged.output = { ...base.output, ...overlay.output };
    }

    if (overlay.network) {
        merged.network = { ...base.network, ...overlay.network };
    }

    if (overlay.proxy) {
        merged.proxy = { ...base.proxy, ...overlay.proxy };
    }

    return merged;
}

/** Optimistic renderer merge before main sanitizes the IPC patch. */
export function mergeAdvancedDownloadDefaultsUiPatch(
    base: AdvancedDownloadDefaults,
    patch: AdvancedDownloadDefaultsPatch
): AdvancedDownloadDefaults {
    return normalizeAdvancedDownloadDefaults({
        ...base,
        ...patch,
        subtitles: patch.subtitles ? { ...base.subtitles, ...patch.subtitles } : base.subtitles,
        output: patch.output ? { ...base.output, ...patch.output } : base.output,
        network: patch.network ? { ...base.network, ...patch.network } : base.network,
        proxy: patch.proxy ? { ...base.proxy, ...patch.proxy } : base.proxy,
        sponsorblock: patch.sponsorblock
            ? { ...base.sponsorblock, ...patch.sponsorblock }
            : base.sponsorblock,
        archive: patch.archive ? { ...base.archive, ...patch.archive } : base.archive
    });
}
