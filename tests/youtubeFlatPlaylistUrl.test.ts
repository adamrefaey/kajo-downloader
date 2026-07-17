import { describe, expect, it } from 'vitest';
import { resolveYoutubeFlatPlaylistLookupUrl } from '../src/shared/youtubeFlatPlaylistUrl';

describe('resolveYoutubeFlatPlaylistLookupUrl', () => {
    it('rewrites /channel/UC… to the uploads playlist (UU…)', () => {
        expect(
            resolveYoutubeFlatPlaylistLookupUrl(
                'https://www.youtube.com/channel/UCvQECJukTDE2i6aCoMnS-Vg'
            )
        ).toBe('https://www.youtube.com/playlist?list=UUvQECJukTDE2i6aCoMnS-Vg');
    });

    it('accepts optional /videos suffix on channel URLs', () => {
        expect(
            resolveYoutubeFlatPlaylistLookupUrl(
                'https://www.youtube.com/channel/UCvQECJukTDE2i6aCoMnS-Vg/videos'
            )
        ).toBe('https://www.youtube.com/playlist?list=UUvQECJukTDE2i6aCoMnS-Vg');
    });

    it('leaves playlist URLs unchanged', () => {
        const u = 'https://www.youtube.com/playlist?list=PLabc123';
        expect(resolveYoutubeFlatPlaylistLookupUrl(u)).toBe(u);
    });

    it('rewrites bare @handle channel URLs to the /videos tab for flat playlist probes', () => {
        expect(resolveYoutubeFlatPlaylistLookupUrl('https://www.youtube.com/@bigthink')).toBe(
            'https://www.youtube.com/@bigthink/videos'
        );
        expect(resolveYoutubeFlatPlaylistLookupUrl('https://m.youtube.com/@bigthink/')).toBe(
            'https://www.youtube.com/@bigthink/videos'
        );
    });

    it('leaves @handle tab URLs unchanged', () => {
        const u = 'https://www.youtube.com/@bigthink/videos';
        expect(resolveYoutubeFlatPlaylistLookupUrl(u)).toBe(u);
        expect(
            resolveYoutubeFlatPlaylistLookupUrl('https://www.youtube.com/@bigthink/shorts')
        ).toBe('https://www.youtube.com/@bigthink/shorts');
    });
});
