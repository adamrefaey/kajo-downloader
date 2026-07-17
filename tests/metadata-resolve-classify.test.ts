import { describe, expect, it } from 'vitest';
import {
    classifyMetadataResolveStderr,
    inferMetadataAuthReason,
    pickCanonicalMediaUrl,
    shouldBlockSingleVideoFallbackAfterFlatFailure,
    shouldRetryWithoutCookies,
    tryHttpsOriginForSignIn
} from '../electron/services/metadata/errorClassification';

describe('classifyMetadataResolveStderr', () => {
    it('returns unsupported for extractor / URL errors', () => {
        expect(classifyMetadataResolveStderr('ERROR: Unsupported URL: x')).toBe('unsupported');
        expect(classifyMetadataResolveStderr('No suitable extractor')).toBe('unsupported');
        expect(classifyMetadataResolveStderr('no matching extractor')).toBe('unsupported');
    });

    it('returns auth-required for cookie / sign-in style errors', () => {
        expect(
            classifyMetadataResolveStderr(
                'Sign in to confirm your age. This video may be inappropriate'
            )
        ).toBe('auth-required');
        expect(
            classifyMetadataResolveStderr(
                'Use --cookies-from-browser or --cookies for the authentication'
            )
        ).toBe('auth-required');
        expect(classifyMetadataResolveStderr('Private video')).toBe('auth-required');
        expect(classifyMetadataResolveStderr('Login required')).toBe('auth-required');
    });

    it('returns blocked for DRM and geo / copyright style errors', () => {
        expect(classifyMetadataResolveStderr('This format is DRM protected')).toBe('blocked');
        expect(classifyMetadataResolveStderr('widevine license')).toBe('blocked');
        expect(classifyMetadataResolveStderr('not available in your country')).toBe('blocked');
        expect(classifyMetadataResolveStderr('blocked by the uploader')).toBe('blocked');
        expect(classifyMetadataResolveStderr('Video unavailable due to copyright')).toBe('blocked');
    });

    it('returns unsupported for empty stderr', () => {
        expect(classifyMetadataResolveStderr('')).toBe('unsupported');
        expect(classifyMetadataResolveStderr('   \n  ')).toBe('unsupported');
    });

    it('returns blocked for additional geo / DRM / termination phrases', () => {
        expect(classifyMetadataResolveStderr('FairPlay is required')).toBe('blocked');
        expect(classifyMetadataResolveStderr('only available in the US')).toBe('blocked');
        expect(
            classifyMetadataResolveStderr(
                'contains content from SME, who has blocked it in your country'
            )
        ).toBe('blocked');
        expect(
            classifyMetadataResolveStderr(
                'The account associated with this video has been terminated'
            )
        ).toBe('blocked');
    });

    it('returns auth-required when cookies are mentioned without the cookie-retry heuristics', () => {
        expect(
            classifyMetadataResolveStderr(
                'ERROR: bad jar — cookies invalid; use --cookies-from-browser for authentication'
            )
        ).toBe('auth-required');
        expect(classifyMetadataResolveStderr('Authentication required for this video')).toBe(
            'auth-required'
        );
        expect(classifyMetadataResolveStderr('This video requires login required status')).toBe(
            'auth-required'
        );
        expect(
            classifyMetadataResolveStderr('Missing jar; cookies present use --cookies-from-browser')
        ).toBe('auth-required');
        expect(classifyMetadataResolveStderr('cookies flag use --cookies for site')).toBe(
            'auth-required'
        );
    });

    it('returns unsupported when stderr does not match known patterns', () => {
        expect(classifyMetadataResolveStderr('ERROR: generic yt-dlp failure')).toBe('unsupported');
    });
});

describe('inferMetadataAuthReason', () => {
    it('maps stderr phrases to reason codes', () => {
        expect(inferMetadataAuthReason('Use --cookies-from-browser or --cookies')).toBe(
            'cookies_missing'
        );
        expect(inferMetadataAuthReason('Login required')).toBe('login_required');
        expect(inferMetadataAuthReason('Private video')).toBe('private_or_members');
        expect(inferMetadataAuthReason('Sign in to confirm your age')).toBe('age_or_bot_check');
        expect(inferMetadataAuthReason('Something else entirely')).toBe('unknown');
    });

    it('covers members / subscriber / bot / cookie-auth branches', () => {
        expect(inferMetadataAuthReason('MEMBERS ONLY content')).toBe('private_or_members');
        expect(inferMetadataAuthReason('subscriber-only video')).toBe('private_or_members');
        expect(inferMetadataAuthReason('subscriber only')).toBe('private_or_members');
        expect(inferMetadataAuthReason('premium_only track')).toBe('private_or_members');
        expect(inferMetadataAuthReason('confirm your age')).toBe('age_or_bot_check');
        expect(inferMetadataAuthReason("sign in to confirm you're not a bot")).toBe(
            'age_or_bot_check'
        );
        expect(inferMetadataAuthReason('not a bot check failed')).toBe('age_or_bot_check');
        expect(inferMetadataAuthReason('cookie jar needs authentication')).toBe('cookies_missing');
    });
});

describe('shouldRetryWithoutCookies', () => {
    it('returns false for generic sign-in / cookie hints that should not cookie-retry', () => {
        expect(shouldRetryWithoutCookies('Sign in to confirm your age')).toBe(false);
        expect(shouldRetryWithoutCookies('Use --cookies-from-browser or --cookies please')).toBe(
            false
        );
    });

    it('returns true for cookie jar / keyring style failures', () => {
        expect(shouldRetryWithoutCookies('failed to decrypt master key')).toBe(true);
        expect(shouldRetryWithoutCookies('could not find cookies database')).toBe(true);
        expect(shouldRetryWithoutCookies('error loading cookies from jar')).toBe(true);
        expect(shouldRetryWithoutCookies('failed to load cookies file')).toBe(true);
        expect(shouldRetryWithoutCookies('libsecret keyring error')).toBe(true);
        expect(shouldRetryWithoutCookies('browser cookies are unavailable')).toBe(true);
    });
});

describe('tryHttpsOriginForSignIn', () => {
    it('returns undefined for empty or non-http(s) origins', () => {
        expect(tryHttpsOriginForSignIn('   ')).toBeUndefined();
        expect(tryHttpsOriginForSignIn('file:///tmp/x')).toBeUndefined();
        expect(tryHttpsOriginForSignIn('not a url')).toBeUndefined();
    });

    it('normalizes bare hosts and preserves origins for full URLs', () => {
        expect(tryHttpsOriginForSignIn('Example.COM')).toBe('https://example.com');
        expect(tryHttpsOriginForSignIn('https://example.com/path?q=1')).toBe('https://example.com');
        expect(tryHttpsOriginForSignIn('http://localhost:8080/x')).toBe('http://localhost:8080');
    });
});

describe('pickCanonicalMediaUrl', () => {
    it('prefers absolute http(s) URLs and otherwise falls back', () => {
        expect(pickCanonicalMediaUrl('https://a/b', 'fallback')).toBe('https://a/b');
        expect(pickCanonicalMediaUrl('HTTP://A/B', 'fallback')).toBe('HTTP://A/B');
        expect(pickCanonicalMediaUrl('ftp://a/b', 'fallback')).toBe('fallback');
        expect(pickCanonicalMediaUrl('  ', 'fallback')).toBe('fallback');
        expect(pickCanonicalMediaUrl(null, 'fallback')).toBe('fallback');
    });
});

describe('shouldBlockSingleVideoFallbackAfterFlatFailure', () => {
    it('returns true when lookup URL differs from the trimmed original', () => {
        expect(
            shouldBlockSingleVideoFallbackAfterFlatFailure(
                'https://www.youtube.com/watch?v=abc',
                'https://www.youtube.com/watch?v=xyz'
            )
        ).toBe(true);
    });

    it('returns true for known-site multi candidates and false for plain watch URLs', () => {
        const channel = 'https://www.youtube.com/@SomeChannel/videos';
        expect(shouldBlockSingleVideoFallbackAfterFlatFailure(channel, channel)).toBe(true);
        const watch = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        expect(shouldBlockSingleVideoFallbackAfterFlatFailure(watch, watch)).toBe(false);
    });

    it('returns false for multi heuristics on unknown hosts', () => {
        const u = 'https://unknown-host.example/playlist/123';
        expect(shouldBlockSingleVideoFallbackAfterFlatFailure(u, u)).toBe(false);
    });
});
