import { describe, expect, it } from 'vitest';
import {
    tryExtractYouTubeVideoId,
    youtubeSingleVideoUrlsPointToSameMedia
} from '../src/shared/youtubeUrlEquivalence';

describe('youtubeUrlEquivalence', () => {
    it('extracts watch v= id', () => {
        expect(tryExtractYouTubeVideoId('https://www.youtube.com/watch?v=PVgo9eCInSM')).toBe(
            'PVgo9eCInSM'
        );
    });

    it('treats www and youtu.be as same video', () => {
        expect(
            youtubeSingleVideoUrlsPointToSameMedia(
                'https://youtube.com/watch?v=PVgo9eCInSM',
                'https://www.youtube.com/watch?v=PVgo9eCInSM&feature=share'
            )
        ).toBe(true);
        expect(
            youtubeSingleVideoUrlsPointToSameMedia(
                'https://youtu.be/PVgo9eCInSM',
                'https://m.youtube.com/watch?v=PVgo9eCInSM'
            )
        ).toBe(true);
    });

    it('does not equate different videos', () => {
        expect(
            youtubeSingleVideoUrlsPointToSameMedia(
                'https://www.youtube.com/watch?v=PVgo9eCInSM',
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            )
        ).toBe(false);
    });

    it('extracts shorts, live, and youtu.be ids', () => {
        expect(tryExtractYouTubeVideoId('https://youtu.be/PVgo9eCInSM')).toBe('PVgo9eCInSM');
        expect(tryExtractYouTubeVideoId('https://www.youtube.com/shorts/PVgo9eCInSM')).toBe(
            'PVgo9eCInSM'
        );
        expect(tryExtractYouTubeVideoId('https://www.youtube.com/live/PVgo9eCInSM')).toBe(
            'PVgo9eCInSM'
        );
    });

    it('returns null for empty or invalid urls', () => {
        expect(tryExtractYouTubeVideoId('')).toBeNull();
        expect(tryExtractYouTubeVideoId('https://example.com/watch?v=PVgo9eCInSM')).toBeNull();
        expect(tryExtractYouTubeVideoId('http://[::1')).toBeNull();
    });

    it('falls back to trimmed string equality when ids are unavailable', () => {
        expect(youtubeSingleVideoUrlsPointToSameMedia('  same ', 'same')).toBe(true);
    });
});
