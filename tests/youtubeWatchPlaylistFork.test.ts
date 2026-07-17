import { describe, expect, it } from 'vitest';
import { tryYoutubeWatchPlaylistFork } from '../src/shared/youtubeWatchPlaylistFork';

describe('tryYoutubeWatchPlaylistFork', () => {
    it('returns single watch URL for watch?v=…&list=…', () => {
        expect(
            tryYoutubeWatchPlaylistFork(
                'https://www.youtube.com/watch?v=We1IvUe6KLo&list=PLmKbqjSZR8TaB3GMTs9Okll0pyq5CoVSB&index=2'
            )
        ).toEqual({
            singleVideoUrl: 'https://www.youtube.com/watch?v=We1IvUe6KLo'
        });
    });

    it('returns undefined for playlist-only URL', () => {
        expect(
            tryYoutubeWatchPlaylistFork(
                'https://www.youtube.com/playlist?list=PLmKbqjSZR8TaB3GMTs9Okll0pyq5CoVSB'
            )
        ).toBeUndefined();
    });

    it('returns undefined for watch without list', () => {
        expect(
            tryYoutubeWatchPlaylistFork('https://www.youtube.com/watch?v=We1IvUe6KLo')
        ).toBeUndefined();
    });

    it('handles youtu.be with list', () => {
        expect(tryYoutubeWatchPlaylistFork('https://youtu.be/We1IvUe6KLo?list=PLabc')).toEqual({
            singleVideoUrl: 'https://www.youtube.com/watch?v=We1IvUe6KLo'
        });
    });
});
