import { describe, expect, it } from 'vitest';
import siteCoverage from '../src/shared/generated/siteCoverage.v1.json';
import type { SiteCoverageV1 } from '../src/shared/siteCoverage.types';
import {
    assertSiteCoverageMatchesProfiles,
    GENERIC_YTDLP_SITE_ID,
    getSignInHomeUrlForProfile,
    getSiteProfileByExtractorKeyLoose,
    getSiteProfileByHostOrUrl,
    getSiteProfileBySiteId,
    getSiteProfilesByExtractorKey,
    isSiteProfile,
    listSiteProfilesInRolloutOrder,
    ROLLOUT_TOP_20_SITE_IDS,
    SITE_PROFILES
} from '../src/shared/siteProfiles';

describe('siteProfiles', () => {
    it('locks exactly twenty rollout targets', () => {
        expect(SITE_PROFILES.length).toBe(20);
        expect(ROLLOUT_TOP_20_SITE_IDS.length).toBe(20);
        const ranks = SITE_PROFILES.map((p) => p.rolloutRank);
        expect(new Set(ranks).size).toBe(20);
        expect(Math.min(...ranks)).toBe(1);
        expect(Math.max(...ranks)).toBe(20);
    });

    it('matches generated site coverage rollout metadata', () => {
        assertSiteCoverageMatchesProfiles(siteCoverage as SiteCoverageV1);
    });

    it('resolves hosts and extractors', () => {
        expect(getSiteProfileBySiteId('youtube')?.displayName).toBe('YouTube');
        expect(getSiteProfileByHostOrUrl('https://www.youtube.com/watch?v=1')?.siteId).toBe(
            'youtube'
        );
        expect(getSiteProfileByHostOrUrl('youtu.be/abc')?.siteId).toBe('youtube');
        expect(getSiteProfileByHostOrUrl('https://m.twitch.tv/foo')?.siteId).toBe('twitch');
        expect(getSiteProfilesByExtractorKey('TikTok').map((p) => p.siteId)).toContain('tiktok');
        expect(getSiteProfileByExtractorKeyLoose('Youtube')?.siteId).toBe('youtube');
        expect(getSiteProfileByExtractorKeyLoose('instagram:user')?.siteId).toBe('instagram');
        expect(getSiteProfileByExtractorKeyLoose('instagram:tag')?.siteId).toBe('instagram');
        expect(getSiteProfileByExtractorKeyLoose('facebook:reel')?.siteId).toBe('facebook');
    });

    it('lists rollout order by rank', () => {
        const ordered = listSiteProfilesInRolloutOrder();
        expect(ordered[0]?.siteId).toBe('youtube');
        expect(ordered[1]?.siteId).toBe('tiktok');
        expect(ordered[19]?.siteId).toBe('mixcloud');
    });

    it('getSignInHomeUrlForProfile uses primary domain', () => {
        const yt = getSiteProfileBySiteId('youtube');
        expect(yt && getSignInHomeUrlForProfile(yt)).toBe('https://youtube.com');
        const tw = getSiteProfileBySiteId('twitter');
        expect(tw && getSignInHomeUrlForProfile(tw)).toBe('https://twitter.com');
    });

    it('isSiteProfile validates shape', () => {
        expect(isSiteProfile(SITE_PROFILES[0])).toBe(true);
        expect(isSiteProfile({})).toBe(false);
    });

    it('exposes synthetic generic yt-dlp site id outside rollout profiles', () => {
        expect(GENERIC_YTDLP_SITE_ID).toBe('ytdlp-generic');
        expect(getSiteProfileBySiteId(GENERIC_YTDLP_SITE_ID)).toBeUndefined();
    });
});
