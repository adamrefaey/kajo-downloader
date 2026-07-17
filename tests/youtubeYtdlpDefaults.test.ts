import { describe, expect, it } from 'vitest';
import {
    getYoutubeExtractorArgs,
    getYoutubeExtractorDownloadArgs,
    isYoutubeUrl,
    shouldRetryYoutubeWithAlternatePlayerClient,
    YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS
} from '../electron/services/youtubeYtdlpDefaults';

describe('youtubeYtdlpDefaults', () => {
    it('isYoutubeUrl', () => {
        expect(isYoutubeUrl('https://www.youtube.com/watch?v=PVgo9eCInSM')).toBe(true);
        expect(isYoutubeUrl('https://youtu.be/x')).toBe(true);
        expect(isYoutubeUrl('https://music.youtube.com/watch?v=x')).toBe(true);
        expect(isYoutubeUrl('https://m.youtube.com/watch?v=x')).toBe(true);
        expect(isYoutubeUrl('https://example.com/')).toBe(false);
        expect(isYoutubeUrl('not-a-url')).toBe(false);
    });

    it('getYoutubeExtractorArgs switches client set for authenticated vs anonymous', () => {
        const anon = getYoutubeExtractorArgs(false);
        const authed = getYoutubeExtractorArgs(true);
        expect(anon).toEqual([]);
        expect(authed.join(' ')).toContain('web_safari');
        expect(anon).not.toEqual(authed);
    });

    it('getYoutubeExtractorDownloadArgs mirrors metadata-phase args for format-ladder parity', () => {
        const anon = getYoutubeExtractorDownloadArgs(false);
        const authed = getYoutubeExtractorDownloadArgs(true);
        expect(anon).toEqual(getYoutubeExtractorArgs(false));
        expect(authed).toEqual(getYoutubeExtractorArgs(true));
        expect(anon.join(' ')).not.toContain('player_skip');
        expect(authed.join(' ')).toContain('web_safari');
        expect(authed.join(' ')).not.toContain('player_skip');
        expect(anon).not.toEqual(authed);
    });

    it('shouldRetryYoutubeWithAlternatePlayerClient matches consent/bot but not private/age', () => {
        expect(shouldRetryYoutubeWithAlternatePlayerClient('')).toBe(false);
        expect(shouldRetryYoutubeWithAlternatePlayerClient('redirect to consent.youtube.com')).toBe(
            true
        );
        expect(
            shouldRetryYoutubeWithAlternatePlayerClient("Sign in to confirm you're not a bot")
        ).toBe(true);
        expect(shouldRetryYoutubeWithAlternatePlayerClient('Private video')).toBe(false);
        expect(shouldRetryYoutubeWithAlternatePlayerClient('Sign in to confirm your age')).toBe(
            false
        );
        expect(shouldRetryYoutubeWithAlternatePlayerClient('members only video')).toBe(false);
        expect(shouldRetryYoutubeWithAlternatePlayerClient('Join this channel to watch')).toBe(
            false
        );
        expect(shouldRetryYoutubeWithAlternatePlayerClient('before you continue to youtube')).toBe(
            true
        );
        expect(shouldRetryYoutubeWithAlternatePlayerClient('cookie consent page')).toBe(true);
        expect(
            shouldRetryYoutubeWithAlternatePlayerClient('sign in to confirm you’re not a bot')
        ).toBe(true);
    });

    it('YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS targets tv_embedded', () => {
        expect(YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS.join(' ')).toContain('tv_embedded');
    });
});
