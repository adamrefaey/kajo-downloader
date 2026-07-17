import { describe, expect, it } from 'vitest';
import {
    clipboardAutopasteClipboardTextsEquivalent,
    clipboardAutopasteUrlsEquivalent
} from '../src/shared/clipboardAutopasteUrl';

describe('clipboardAutopasteUrlsEquivalent', () => {
    it('treats same YouTube video under different URL shapes as equivalent', () => {
        expect(
            clipboardAutopasteUrlsEquivalent(
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'https://youtu.be/dQw4w9WgXcQ'
            )
        ).toBe(true);
    });

    it('compares non-YouTube URLs by host, path, and query', () => {
        expect(
            clipboardAutopasteUrlsEquivalent(
                'https://www.example.com/a?x=1',
                'https://example.com/a?x=1'
            )
        ).toBe(true);
        expect(
            clipboardAutopasteUrlsEquivalent('https://example.com/a', 'https://example.com/b')
        ).toBe(false);
    });

    it('clipboardAutopasteClipboardTextsEquivalent compares batch lines pairwise', () => {
        expect(
            clipboardAutopasteClipboardTextsEquivalent(
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://vimeo.com/1',
                'https://youtu.be/dQw4w9WgXcQ\nhttps://vimeo.com/1'
            )
        ).toBe(true);
        expect(
            clipboardAutopasteClipboardTextsEquivalent(
                'https://a.example/a\nhttps://a.example/b',
                'https://a.example/a\nhttps://a.example/c'
            )
        ).toBe(false);
        expect(
            clipboardAutopasteClipboardTextsEquivalent(
                'https://x.com/a',
                'https://x.com/a\nhttps://y.com/b'
            )
        ).toBe(false);
    });
});
