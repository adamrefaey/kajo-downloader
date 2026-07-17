import type { MediaCandidateCollectionKind, UrlCandidateMode } from '../types';
import type { SiteProfile } from './siteProfiles';
import { getSiteProfileByHostOrUrl, getSiteProfileBySiteId } from './siteProfiles';
import { classifyYouTubeUrl } from './youtubeUrlClassification';

export type { UrlCandidateMode } from '../types';

export interface MediaUrlResolution {
    siteProfile: SiteProfile | undefined;
    candidateMode: UrlCandidateMode;
    /** YouTube batch only: channel tab UI vs flat playlist UI. */
    youtubeBatchKind: 'playlist' | 'channel' | undefined;
}

export function parseHttpMediaUrl(rawInput: string): URL | null {
    const trimmed = rawInput.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const u = new URL(trimmed);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return null;
        }
        return u;
    } catch {
        return null;
    }
}

function isYoutubeHost(hostname: string): boolean {
    const h = hostname.replace(/^www\./i, '').toLowerCase();
    return (
        h === 'youtu.be' ||
        h === 'youtube.com' ||
        h === 'm.youtube.com' ||
        h === 'music.youtube.com' ||
        h === 'youtube-nocookie.com'
    );
}

function inferMultiFromPathAndQuery(parsed: URL, profile: SiteProfile | undefined): boolean {
    const path = parsed.pathname.toLowerCase();
    if (parsed.searchParams.has('list')) {
        return true;
    }
    if (path.includes('/playlist')) {
        return true;
    }
    if (path.includes('/sets/')) {
        return true;
    }
    if (path.includes('/album/')) {
        return true;
    }
    if (path.includes('/playlists/')) {
        return true;
    }
    if (profile?.siteId === 'tiktok') {
        if (/^\/@[^/]+\/?$/i.test(parsed.pathname)) {
            return true;
        }
        if (/\/@[^/]+\/collection\//i.test(parsed.pathname)) {
            return true;
        }
    }
    if (profile?.siteId === 'instagram') {
        const plower = parsed.pathname.toLowerCase();
        if (plower === '/explore' || plower.startsWith('/explore/')) {
            return true;
        }
        if (plower === '/reels' || plower === '/reels/') {
            return true;
        }
        if (/^\/(p|reel|tv)\/[^/]+/.test(plower)) {
            return false;
        }
        if (plower.includes('/stories/')) {
            return false;
        }
        const reelsMaybePermalink = plower.match(/^\/reels\/([^/]+)\/?$/);
        if (reelsMaybePermalink?.[1] && /^[a-z0-9_-]{5,32}$/i.test(reelsMaybePermalink[1])) {
            return false;
        }
        const oneSeg = plower.match(/^\/([^/]+)\/?$/);
        if (oneSeg) {
            const reserved = new Set([
                'p',
                'reel',
                'reels',
                'stories',
                'explore',
                'tv',
                'accounts',
                'direct',
                'developer',
                'graphql',
                'help',
                'legal',
                'about',
                'privacy',
                'support',
                'nametag',
                'static',
                'download'
            ]);
            if (!reserved.has(oneSeg[1] ?? '')) {
                return true;
            }
        }
        if (/^\/[^/]+\/reels\/?$/i.test(plower)) {
            const first = plower.split('/').filter(Boolean)[0];
            if (first && !['explore', 'accounts', 'direct'].includes(first)) {
                return true;
            }
        }
    }
    if (profile?.siteId === 'facebook') {
        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        if (host === 'fb.watch') {
            return false;
        }
        const plower = parsed.pathname.toLowerCase();
        if (/\/watch(\/|$)/.test(plower) && parsed.searchParams.has('v')) {
            return false;
        }
        if (/\/reel\/[^/]+/.test(plower)) {
            return false;
        }
        if (plower === '/reels' || plower === '/reels/') {
            return true;
        }
        if (/^\/[^/]+\/reels\/?$/.test(plower)) {
            return true;
        }
        if (/\/videos\/\d+/i.test(plower)) {
            return false;
        }
        if (/\/videos\/?$/.test(plower)) {
            return true;
        }
        if (/\/posts\/[^/?#]+/i.test(plower)) {
            return false;
        }
    }
    return false;
}

/**
 * Classifies a pasted URL for site rollout profile and single vs multi-item handling.
 */
export function resolveMediaInputUrl(rawInput: string): MediaUrlResolution {
    const trimmed = rawInput.trim();
    const parsed = parseHttpMediaUrl(trimmed);
    if (!parsed) {
        return {
            siteProfile: undefined,
            candidateMode: 'unsupported',
            youtubeBatchKind: undefined
        };
    }

    const siteProfile = getSiteProfileByHostOrUrl(trimmed);

    if (isYoutubeHost(parsed.hostname)) {
        const yt = classifyYouTubeUrl(trimmed);
        if (yt === 'unsupported') {
            return {
                siteProfile: siteProfile ?? getSiteProfileBySiteId('youtube'),
                candidateMode: 'unsupported',
                youtubeBatchKind: undefined
            };
        }
        if (yt === 'video') {
            return { siteProfile, candidateMode: 'single', youtubeBatchKind: undefined };
        }
        if (yt === 'playlist') {
            return { siteProfile, candidateMode: 'multi', youtubeBatchKind: 'playlist' };
        }
        return { siteProfile, candidateMode: 'multi', youtubeBatchKind: 'channel' };
    }

    if (siteProfile) {
        if (!siteProfile.supportsMulti) {
            return { siteProfile, candidateMode: 'single', youtubeBatchKind: undefined };
        }
        const multi = inferMultiFromPathAndQuery(parsed, siteProfile);
        return {
            siteProfile,
            candidateMode: multi ? 'multi' : 'single',
            youtubeBatchKind: undefined
        };
    }

    const multiGeneric = inferMultiFromPathAndQuery(parsed, undefined);
    return {
        siteProfile: undefined,
        candidateMode: multiGeneric ? 'multi' : 'single',
        youtubeBatchKind: undefined
    };
}

/**
 * Maps a media URL to a coarse container kind for {@link PlaylistInfo.collectionKind}.
 */
export function inferMediaCandidateCollectionKind(rawInput: string): MediaCandidateCollectionKind {
    const r = resolveMediaInputUrl(rawInput);
    if (r.youtubeBatchKind === 'playlist') {
        return 'playlist';
    }
    if (r.youtubeBatchKind === 'channel') {
        return 'channel';
    }
    if (r.siteProfile?.siteId === 'tiktok' && r.candidateMode === 'multi') {
        const p = parseHttpMediaUrl(rawInput);
        if (p && /\/@[^/]+\/collection\//i.test(p.pathname)) {
            return 'playlist';
        }
        return 'profile';
    }
    if (r.siteProfile?.siteId === 'instagram' && r.candidateMode === 'multi') {
        const p = parseHttpMediaUrl(rawInput);
        if (p?.pathname.toLowerCase().includes('/explore/tags/')) {
            return 'playlist';
        }
        return 'profile';
    }
    if (r.siteProfile?.siteId === 'facebook' && r.candidateMode === 'multi') {
        return 'profile';
    }
    if (r.candidateMode === 'multi') {
        return 'unknown';
    }
    return 'unknown';
}
