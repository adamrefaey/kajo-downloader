import type { SiteCoverageV1 } from './siteCoverage.types';

/**
 * Human-readable limitation for QA / UX (DRM, geo, auth quirks, extractor gaps).
 * `code` is a stable machine key; `description` is English prose for logs or UI.
 */
export interface SiteKnownLimitation {
    code: string;
    description: string;
}

/**
 * Rollout target: one logical “site” mapped to yt-dlp extractor keys and hostnames.
 * Used by main/renderer for resolver UX, auth scope, and multi-video flows.
 */
export interface SiteProfile {
    siteId: string;
    displayName: string;
    /** Primary hostname hints (no scheme); lowercase; match subdomains via suffix. */
    domains: string[];
    /** yt-dlp extractor / IE names that satisfy URLs for this profile. */
    extractorKeys: string[];
    /** Whether embedded browser / cookie jar auth is expected to matter for some URLs. */
    supportsAuth: boolean;
    /** Playlists, channels, multi-post pages, etc. */
    supportsMulti: boolean;
    knownLimitations: SiteKnownLimitation[];
    /** 1-based position in the locked top-20 rollout list. */
    rolloutRank: number;
    /** Relative demand weight from rollout planning (documentation / telemetry). */
    demandScore: number;
}

const _profiles: SiteProfile[] = [
    {
        siteId: 'youtube',
        displayName: 'YouTube',
        domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
        extractorKeys: ['youtube', 'youtube:tab', 'youtube:playlist', 'youtube:search'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 1,
        demandScore: 100,
        knownLimitations: [
            { code: 'drm', description: 'DRM or premium rental streams may be unavailable.' },
            {
                code: 'members_only',
                description: 'Members-only or private items need a signed-in cookie jar.'
            }
        ]
    },
    {
        siteId: 'tiktok',
        displayName: 'TikTok',
        domains: ['tiktok.com'],
        extractorKeys: ['TikTok', 'tiktok:user', 'tiktok:collection', 'tiktok:live', 'vm.tiktok'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 2,
        demandScore: 95,
        knownLimitations: [
            {
                code: 'live',
                description: 'Live streams may need different handling than VOD clips.'
            }
        ]
    },
    {
        siteId: 'instagram',
        displayName: 'Instagram',
        domains: ['instagram.com'],
        extractorKeys: ['Instagram', 'instagram:story', 'instagram:user', 'instagram:tag'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 3,
        demandScore: 92,
        knownLimitations: [
            { code: 'rate_limit', description: 'Meta rate limits and login walls are common.' }
        ]
    },
    {
        siteId: 'facebook',
        displayName: 'Facebook',
        domains: ['facebook.com', 'fb.watch', 'm.facebook.com'],
        extractorKeys: ['facebook', 'facebook:reel'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 4,
        demandScore: 90,
        knownLimitations: [
            { code: 'auth', description: 'Many videos require an authenticated session.' }
        ]
    },
    {
        siteId: 'twitter',
        displayName: 'X (Twitter)',
        domains: ['twitter.com', 'x.com', 'mobile.twitter.com'],
        extractorKeys: ['twitter', 'twitter:spaces'],
        supportsAuth: true,
        supportsMulti: false,
        rolloutRank: 5,
        demandScore: 88,
        knownLimitations: [
            { code: 'auth', description: 'Logged-in cookies often required for media.' }
        ]
    },
    {
        siteId: 'twitch',
        displayName: 'Twitch',
        domains: ['twitch.tv', 'm.twitch.tv'],
        extractorKeys: ['twitch:vod', 'twitch:stream', 'twitch:clips', 'twitch:collection'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 6,
        demandScore: 85,
        knownLimitations: [
            {
                code: 'subscriber',
                description: 'Subscriber-only or tokenized streams may fail without auth.'
            }
        ]
    },
    {
        siteId: 'vimeo',
        displayName: 'Vimeo',
        domains: ['vimeo.com', 'player.vimeo.com'],
        extractorKeys: ['vimeo', 'vimeo:album', 'vimeo:channel'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 7,
        demandScore: 82,
        knownLimitations: [
            {
                code: 'ondemand',
                description: 'Vimeo On Demand / private reviews may need purchase or login.'
            }
        ]
    },
    {
        siteId: 'dailymotion',
        displayName: 'Dailymotion',
        domains: ['dailymotion.com', 'dai.ly'],
        extractorKeys: ['dailymotion', 'dailymotion:playlist', 'dailymotion:user'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 8,
        demandScore: 80,
        knownLimitations: [{ code: 'geo', description: 'Geo or age gates may apply.' }]
    },
    {
        siteId: 'reddit',
        displayName: 'Reddit',
        domains: ['reddit.com', 'old.reddit.com', 'www.reddit.com'],
        extractorKeys: ['Reddit'],
        supportsAuth: true,
        supportsMulti: false,
        rolloutRank: 9,
        demandScore: 78,
        knownLimitations: [
            { code: 'third_party', description: 'Linked media may be hosted on other extractors.' }
        ]
    },
    {
        siteId: 'rumble',
        displayName: 'Rumble',
        domains: ['rumble.com'],
        extractorKeys: ['Rumble', 'RumbleChannel', 'RumbleEmbed'],
        supportsAuth: false,
        supportsMulti: true,
        rolloutRank: 10,
        demandScore: 76,
        knownLimitations: []
    },
    {
        siteId: 'bilibili',
        displayName: 'Bilibili',
        domains: ['bilibili.com', 'b23.tv'],
        extractorKeys: ['BiliBili', 'BilibiliPlaylist', 'BiliBiliBangumi'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 11,
        demandScore: 74,
        knownLimitations: [
            { code: 'region', description: 'Regional availability and login may apply.' }
        ]
    },
    {
        siteId: 'soundcloud',
        displayName: 'SoundCloud',
        domains: ['soundcloud.com'],
        extractorKeys: ['soundcloud', 'soundcloud:playlist', 'soundcloud:set'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 12,
        demandScore: 72,
        knownLimitations: [{ code: 'audio', description: 'Audio-first; video posts are limited.' }]
    },
    {
        siteId: 'bbc',
        displayName: 'BBC',
        domains: ['bbc.co.uk', 'bbc.com'],
        extractorKeys: ['bbc', 'bbc.co.uk', 'bbc.co.uk:iplayer:episodes'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 13,
        demandScore: 65,
        knownLimitations: [
            { code: 'geo', description: 'iPlayer and programmes are often UK-only.' }
        ]
    },
    {
        siteId: 'pbs',
        displayName: 'PBS',
        domains: ['pbs.org', 'video.pbs.org', 'pbskids.org'],
        extractorKeys: ['pbs', 'PBSKids'],
        supportsAuth: false,
        supportsMulti: true,
        rolloutRank: 14,
        demandScore: 62,
        knownLimitations: [{ code: 'geo', description: 'Some programmes are region-restricted.' }]
    },
    {
        siteId: 'nbc',
        displayName: 'NBC',
        domains: ['nbc.com', 'msnbc.com'],
        extractorKeys: ['NBC', 'NBCNews'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 15,
        demandScore: 60,
        knownLimitations: [
            { code: 'cable', description: 'TV-provider or NBCUniversal login may be required.' }
        ]
    },
    {
        siteId: 'vk',
        displayName: 'VK',
        domains: ['vk.com', 'vk.ru', 'vkvideo.ru'],
        extractorKeys: ['vk', 'vk:wallpost'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 16,
        demandScore: 58,
        knownLimitations: [
            { code: 'auth', description: 'Private or restricted videos may need cookies.' }
        ]
    },
    {
        siteId: 'streamable',
        displayName: 'Streamable',
        domains: ['streamable.com'],
        extractorKeys: ['Streamable'],
        supportsAuth: false,
        supportsMulti: false,
        rolloutRank: 17,
        demandScore: 55,
        knownLimitations: []
    },
    {
        siteId: 'linkedin',
        displayName: 'LinkedIn',
        domains: ['linkedin.com'],
        extractorKeys: ['LinkedIn', 'linkedin:learning'],
        supportsAuth: true,
        supportsMulti: false,
        rolloutRank: 18,
        demandScore: 52,
        knownLimitations: [
            {
                code: 'auth',
                description: 'Learning and most video URLs require a signed-in session.'
            }
        ]
    },
    {
        siteId: 'bandcamp',
        displayName: 'Bandcamp',
        domains: ['bandcamp.com'],
        extractorKeys: ['Bandcamp', 'Bandcamp:album'],
        supportsAuth: false,
        supportsMulti: true,
        rolloutRank: 19,
        demandScore: 50,
        knownLimitations: [
            { code: 'audio', description: 'Primarily music; video extras vary by release.' }
        ]
    },
    {
        siteId: 'mixcloud',
        displayName: 'Mixcloud',
        domains: ['mixcloud.com'],
        extractorKeys: ['mixcloud', 'mixcloud:user', 'mixcloud:playlist'],
        supportsAuth: true,
        supportsMulti: true,
        rolloutRank: 20,
        demandScore: 48,
        knownLimitations: [{ code: 'audio', description: 'DJ sets and radio; video is uncommon.' }]
    }
];

export const SITE_PROFILES: readonly SiteProfile[] = _profiles;

/**
 * Synthetic `siteId` when yt-dlp matches a real extractor but the host is outside the locked
 * rollout profiles (general best-effort support).
 */
export const GENERIC_YTDLP_SITE_ID = 'ytdlp-generic';

/** Ordered siteIds for the locked rollout wave (matches `siteCoverage.v1.json` `rolloutTop20`). */
export const ROLLOUT_TOP_20_SITE_IDS: readonly string[] = SITE_PROFILES.map((p) => p.siteId);

const bySiteId = new Map<string, SiteProfile>(
    SITE_PROFILES.map((profile) => [profile.siteId, profile])
);

const byDomain = new Map<string, SiteProfile>();
for (const profile of SITE_PROFILES) {
    for (const domain of profile.domains) {
        byDomain.set(domain.toLowerCase(), profile);
    }
}

export function getSiteProfileBySiteId(siteId: string): SiteProfile | undefined {
    return bySiteId.get(siteId);
}

/** Host or URL string; returns the most specific registered profile, if any. */
export function getSiteProfileByHostOrUrl(input: string): SiteProfile | undefined {
    const host = normalizeHostname(input);
    if (!host) {
        return undefined;
    }
    if (byDomain.has(host)) {
        return byDomain.get(host);
    }
    const segments = host.split('.');
    for (let start = 0; start < segments.length - 1; start += 1) {
        const suffix = segments.slice(start).join('.');
        const hit = byDomain.get(suffix);
        if (hit) {
            return hit;
        }
    }
    return undefined;
}

export function listSiteProfilesInRolloutOrder(): SiteProfile[] {
    return [...SITE_PROFILES].sort((a, b) => a.rolloutRank - b.rolloutRank);
}

/**
 * Homepage URL for embedded site sign-in (primary rollout domain).
 * Used by Site sessions quick picks and re-auth flows.
 */
export function getSignInHomeUrlForProfile(profile: SiteProfile): string {
    const raw = profile.domains[0]?.trim().toLowerCase();
    if (!raw) {
        return 'https://example.com';
    }
    return raw.includes('://') ? raw : `https://${raw}`;
}

/** Exact extractor key match (case-sensitive per yt-dlp). */
export function getSiteProfilesByExtractorKey(extractorKey: string): SiteProfile[] {
    return SITE_PROFILES.filter((p) => p.extractorKeys.includes(extractorKey));
}

/** First rollout profile whose extractor list matches case-insensitively (yt-dlp JSON uses mixed case). */
export function getSiteProfileByExtractorKeyLoose(extractorKey: string): SiteProfile | undefined {
    const needle = extractorKey.trim().toLowerCase();
    if (!needle) {
        return undefined;
    }
    for (const p of SITE_PROFILES) {
        if (p.extractorKeys.some((k) => k.toLowerCase() === needle)) {
            return p;
        }
    }
    return undefined;
}

export function isSiteProfile(value: unknown): value is SiteProfile {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const v = value as Record<string, unknown>;
    return (
        typeof v.siteId === 'string' &&
        typeof v.displayName === 'string' &&
        Array.isArray(v.domains) &&
        v.domains.every((d) => typeof d === 'string') &&
        Array.isArray(v.extractorKeys) &&
        v.extractorKeys.every((k) => typeof k === 'string') &&
        typeof v.supportsAuth === 'boolean' &&
        typeof v.supportsMulti === 'boolean' &&
        Array.isArray(v.knownLimitations) &&
        v.knownLimitations.every(
            (lim) =>
                lim &&
                typeof lim === 'object' &&
                typeof (lim as { code?: unknown }).code === 'string' &&
                typeof (lim as { description?: unknown }).description === 'string'
        ) &&
        typeof v.rolloutRank === 'number' &&
        typeof v.demandScore === 'number'
    );
}

/**
 * Assert generated `siteCoverage.v1.json` rollout rows align with `SITE_PROFILES`
 * (siteId order, primary extractor, demand score). Call from tests or CI.
 */
export function assertSiteCoverageMatchesProfiles(coverage: SiteCoverageV1): void {
    const rollout = coverage.rolloutTop20;
    if (rollout.length !== SITE_PROFILES.length) {
        throw new Error(
            `siteCoverage rollout length ${rollout.length} !== SITE_PROFILES ${SITE_PROFILES.length}`
        );
    }
    const ordered = listSiteProfilesInRolloutOrder();
    for (let i = 0; i < rollout.length; i += 1) {
        const row = rollout[i];
        const profile = ordered[i];
        if (!row || !profile) break;
        if (row.siteId !== profile.siteId) {
            throw new Error(
                `Rollout mismatch at ${i}: coverage siteId ${row.siteId} !== profile ${profile.siteId}`
            );
        }
        if (row.demandScore !== profile.demandScore) {
            throw new Error(`Demand score mismatch for ${profile.siteId}`);
        }
        if (row.primaryExtractorKey !== profile.extractorKeys[0]) {
            throw new Error(
                `Primary extractor mismatch for ${profile.siteId}: ${row.primaryExtractorKey} !== ${profile.extractorKeys[0]}`
            );
        }
    }
}

function normalizeHostname(input: string): string | undefined {
    const trimmed = input.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
        const url = new URL(withScheme);
        let host = url.hostname.toLowerCase();
        if (host.startsWith('www.')) {
            host = host.slice(4);
        }
        return host;
    } catch {
        const stripped =
            trimmed
                .replace(/^https?:\/\//i, '')
                .split('/')[0]
                ?.toLowerCase() ?? '';
        if (!stripped) {
            return undefined;
        }
        return stripped.startsWith('www.') ? stripped.slice(4) : stripped;
    }
}
