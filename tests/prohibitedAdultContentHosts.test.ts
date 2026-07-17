import { describe, expect, it } from 'vitest';
import { isProhibitedAdultMediaUrl } from '../src/shared/prohibitedAdultContentHosts';

describe('isProhibitedAdultMediaUrl', () => {
    it('blocks major tube hosts and subdomains', () => {
        expect(isProhibitedAdultMediaUrl('https://www.pornhub.com/view_video.php?viewkey=x')).toBe(
            true
        );
        expect(isProhibitedAdultMediaUrl('https://m.pornhub.com/foo')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://xvideos.com/path')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://www.xnxx.com/video')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://www.redtube.com/123')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://chaturbate.com/room')).toBe(true);
    });

    it('blocks yt-dlp Txxx network and PornTop', () => {
        expect(isProhibitedAdultMediaUrl('https://txxx.com/videos/1/foo')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://www.hclips.com/videos/1/x')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://porntop.com/video/101569/x')).toBe(true);
    });

    it('blocks BongaCams locale / numbered hosts (yt-dlp pattern)', () => {
        expect(isProhibitedAdultMediaUrl('https://de.bongacams.com/foo')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://bongacams2.net/bar')).toBe(true);
    });

    it('blocks numbered xHamster domains (yt-dlp pattern)', () => {
        expect(isProhibitedAdultMediaUrl('https://xhamster2.com/videos/foo-1')).toBe(true);
    });

    it('blocks ancillary adult hosts from yt-dlp extractors', () => {
        expect(isProhibitedAdultMediaUrl('https://erocast.me/track/1')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://murrtube.net/v/foo')).toBe(true);
        expect(isProhibitedAdultMediaUrl('https://share-videos.se/embed/x')).toBe(true);
    });

    it('blocks .xxx TLD', () => {
        expect(isProhibitedAdultMediaUrl('https://example.xxx/v')).toBe(true);
    });

    it('allows normal media sites', () => {
        expect(isProhibitedAdultMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
            false
        );
        expect(isProhibitedAdultMediaUrl('https://vimeo.com/123')).toBe(false);
        expect(isProhibitedAdultMediaUrl('https://www.reddit.com/r/all')).toBe(false);
        expect(isProhibitedAdultMediaUrl('https://rutube.ru/video/1')).toBe(false);
    });

    it('returns false for empty or non-http input', () => {
        expect(isProhibitedAdultMediaUrl('')).toBe(false);
        expect(isProhibitedAdultMediaUrl('not a url')).toBe(false);
    });
});
