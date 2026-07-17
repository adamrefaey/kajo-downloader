import { describe, expect, it } from 'vitest';
import {
    buildYoutubeChannelContentLookupUrls,
    getYoutubeChannelBaseUrl
} from '../src/shared/youtubeChannelContentUrls';

describe('getYoutubeChannelBaseUrl', () => {
    it('strips tab segments from /channel/UC… URLs', () => {
        expect(
            getYoutubeChannelBaseUrl('https://www.youtube.com/channel/UCabc1234567/videos')
        ).toBe('https://www.youtube.com/channel/UCabc1234567');
        expect(
            getYoutubeChannelBaseUrl('https://www.youtube.com/channel/UCabc1234567/shorts')
        ).toBe('https://www.youtube.com/channel/UCabc1234567');
    });

    it('normalizes @handle URLs with tab suffix', () => {
        expect(getYoutubeChannelBaseUrl('https://www.youtube.com/@BigThink/videos')).toBe(
            'https://www.youtube.com/@BigThink'
        );
    });

    it('returns null for non-channel URLs', () => {
        expect(getYoutubeChannelBaseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });
});

describe('buildYoutubeChannelContentLookupUrls', () => {
    it('uses UU uploads playlist for UC channels when videos selected', () => {
        expect(
            buildYoutubeChannelContentLookupUrls(
                'https://www.youtube.com/channel/UCvQECJukTDE2i6aCoMnS-Vg',
                {
                    videos: true,
                    shorts: false,
                    live: false
                }
            )
        ).toEqual(['https://www.youtube.com/playlist?list=UUvQECJukTDE2i6aCoMnS-Vg']);
    });

    it('adds shorts and streams paths for UC channels', () => {
        const base = 'https://www.youtube.com/channel/UCxxxxxxxxxxx';
        expect(
            buildYoutubeChannelContentLookupUrls(base, {
                videos: false,
                shorts: true,
                live: true
            })
        ).toEqual([
            'https://www.youtube.com/channel/UCxxxxxxxxxxx/shorts',
            'https://www.youtube.com/channel/UCxxxxxxxxxxx/streams'
        ]);
    });

    it('uses /videos /shorts /streams for @handle bases', () => {
        const base = 'https://www.youtube.com/@bigthink';
        expect(
            buildYoutubeChannelContentLookupUrls(base, {
                videos: true,
                shorts: true,
                live: false
            })
        ).toEqual([
            'https://www.youtube.com/@bigthink/videos',
            'https://www.youtube.com/@bigthink/shorts'
        ]);
    });
});
