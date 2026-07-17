import { describe, expect, it } from 'vitest';
import {
    inferMediaCandidateCollectionKind,
    resolveMediaInputUrl
} from '../src/shared/mediaUrlResolver';

describe('resolveMediaInputUrl', () => {
    it('classifies YouTube watch as single with youtube profile', () => {
        const r = resolveMediaInputUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(r.candidateMode).toBe('single');
        expect(r.siteProfile?.siteId).toBe('youtube');
        expect(r.youtubeBatchKind).toBeUndefined();
    });

    it('classifies YouTube playlist and channel as multi', () => {
        expect(
            resolveMediaInputUrl('https://www.youtube.com/playlist?list=PLabc').candidateMode
        ).toBe('multi');
        expect(
            resolveMediaInputUrl('https://www.youtube.com/playlist?list=PLabc').youtubeBatchKind
        ).toBe('playlist');
        expect(resolveMediaInputUrl('https://www.youtube.com/@YouTube/videos').candidateMode).toBe(
            'multi'
        );
        expect(
            resolveMediaInputUrl('https://www.youtube.com/@YouTube/videos').youtubeBatchKind
        ).toBe('channel');
    });

    it('supports m.youtube.com and music.youtube.com', () => {
        expect(
            resolveMediaInputUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ').candidateMode
        ).toBe('single');
        expect(
            resolveMediaInputUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ').candidateMode
        ).toBe('single');
    });

    it('maps other rollout hosts to site profiles', () => {
        const vimeo = resolveMediaInputUrl('https://vimeo.com/123456');
        expect(vimeo.siteProfile?.siteId).toBe('vimeo');
        expect(vimeo.candidateMode).toBe('single');
    });

    it('detects multi patterns on supported sites', () => {
        const sc = resolveMediaInputUrl('https://soundcloud.com/artist/sets/mix-1');
        expect(sc.siteProfile?.siteId).toBe('soundcloud');
        expect(sc.candidateMode).toBe('multi');

        const tt = resolveMediaInputUrl('https://www.tiktok.com/@user');
        expect(tt.siteProfile?.siteId).toBe('tiktok');
        expect(tt.candidateMode).toBe('multi');

        const coll = resolveMediaInputUrl(
            'https://www.tiktok.com/@user/collection/some-collection-123'
        );
        expect(coll.siteProfile?.siteId).toBe('tiktok');
        expect(coll.candidateMode).toBe('multi');

        const clip = resolveMediaInputUrl('https://www.tiktok.com/@user/video/7123456789012345678');
        expect(clip.siteProfile?.siteId).toBe('tiktok');
        expect(clip.candidateMode).toBe('single');

        const igProfile = resolveMediaInputUrl('https://www.instagram.com/creatorname/');
        expect(igProfile.siteProfile?.siteId).toBe('instagram');
        expect(igProfile.candidateMode).toBe('multi');

        const igReel = resolveMediaInputUrl('https://www.instagram.com/reel/ABCdefGhIjK/');
        expect(igReel.siteProfile?.siteId).toBe('instagram');
        expect(igReel.candidateMode).toBe('single');

        const igTag = resolveMediaInputUrl('https://www.instagram.com/explore/tags/nature/');
        expect(igTag.siteProfile?.siteId).toBe('instagram');
        expect(igTag.candidateMode).toBe('multi');

        const fbWatch = resolveMediaInputUrl('https://www.facebook.com/watch?v=1234567890123456');
        expect(fbWatch.siteProfile?.siteId).toBe('facebook');
        expect(fbWatch.candidateMode).toBe('single');

        const fbShort = resolveMediaInputUrl('https://fb.watch/shortcode123/');
        expect(fbShort.siteProfile?.siteId).toBe('facebook');
        expect(fbShort.candidateMode).toBe('single');

        const fbReel = resolveMediaInputUrl('https://www.facebook.com/reel/abc123def456/');
        expect(fbReel.siteProfile?.siteId).toBe('facebook');
        expect(fbReel.candidateMode).toBe('single');

        const fbVideosTab = resolveMediaInputUrl('https://www.facebook.com/PageName/videos');
        expect(fbVideosTab.siteProfile?.siteId).toBe('facebook');
        expect(fbVideosTab.candidateMode).toBe('multi');

        const fbSingleInTab = resolveMediaInputUrl(
            'https://www.facebook.com/PageName/videos/1234567890123456'
        );
        expect(fbSingleInTab.siteProfile?.siteId).toBe('facebook');
        expect(fbSingleInTab.candidateMode).toBe('single');
    });

    it('treats unknown hosts as generic single when no multi heuristics match', () => {
        const r = resolveMediaInputUrl('https://example.com/video/1');
        expect(r.siteProfile).toBeUndefined();
        expect(r.candidateMode).toBe('single');
    });

    it('treats list= query as multi for unknown hosts', () => {
        const r = resolveMediaInputUrl('https://example.com/watch?list=PLx');
        expect(r.candidateMode).toBe('multi');
    });

    it('returns unsupported for invalid YouTube shapes', () => {
        const r = resolveMediaInputUrl('https://www.youtube.com/');
        expect(r.candidateMode).toBe('unsupported');
        expect(r.siteProfile?.siteId).toBe('youtube');
    });
});

describe('inferMediaCandidateCollectionKind', () => {
    it('maps YouTube playlist and channel URLs', () => {
        expect(
            inferMediaCandidateCollectionKind('https://www.youtube.com/playlist?list=PLabc')
        ).toBe('playlist');
        expect(inferMediaCandidateCollectionKind('https://www.youtube.com/@x/videos')).toBe(
            'channel'
        );
    });

    it('maps TikTok profile URLs to profile', () => {
        expect(inferMediaCandidateCollectionKind('https://www.tiktok.com/@user')).toBe('profile');
    });

    it('maps TikTok collection URLs to playlist', () => {
        expect(
            inferMediaCandidateCollectionKind(
                'https://www.tiktok.com/@user/collection/some-collection-123'
            )
        ).toBe('playlist');
    });

    it('maps Instagram profile and hashtag URLs', () => {
        expect(inferMediaCandidateCollectionKind('https://www.instagram.com/photographer/')).toBe(
            'profile'
        );
        expect(
            inferMediaCandidateCollectionKind('https://www.instagram.com/explore/tags/street/')
        ).toBe('playlist');
    });

    it('maps Facebook page videos tab to profile collection', () => {
        expect(
            inferMediaCandidateCollectionKind('https://www.facebook.com/SomeBrand/videos/')
        ).toBe('profile');
    });

    it('returns unknown for other multi URLs and singles', () => {
        expect(inferMediaCandidateCollectionKind('https://example.com/watch?list=PLx')).toBe(
            'unknown'
        );
        expect(
            inferMediaCandidateCollectionKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
        ).toBe('unknown');
    });
});
