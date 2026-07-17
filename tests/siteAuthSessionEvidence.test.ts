import { describe, expect, it } from 'vitest';
import { persistedCookiesLookLikeSignedIn } from '../src/shared/siteAuthSessionEvidence';

describe('persistedCookiesLookLikeSignedIn', () => {
    it('rejects empty youtube', () => {
        expect(persistedCookiesLookLikeSignedIn('youtube', [])).toBe(false);
    });

    it('rejects youtube with only consent-style names', () => {
        expect(
            persistedCookiesLookLikeSignedIn('youtube', [{ name: 'CONSENT' }, { name: 'PREF' }])
        ).toBe(false);
    });

    it('accepts youtube with LOGIN_INFO', () => {
        expect(persistedCookiesLookLikeSignedIn('youtube', [{ name: 'LOGIN_INFO' }])).toBe(true);
    });

    it('accepts youtube with Google PSID cookies', () => {
        expect(persistedCookiesLookLikeSignedIn('youtube', [{ name: '__Secure-1PSID' }])).toBe(
            true
        );
    });

    it('covers other known site heuristics', () => {
        expect(persistedCookiesLookLikeSignedIn('tiktok', [{ name: 'sessionid' }])).toBe(true);
        expect(
            persistedCookiesLookLikeSignedIn('instagram', [
                { name: 'sessionid' },
                { name: 'ds_user_id' }
            ])
        ).toBe(true);
        expect(
            persistedCookiesLookLikeSignedIn('facebook', [{ name: 'c_user' }, { name: 'xs' }])
        ).toBe(true);
        expect(persistedCookiesLookLikeSignedIn('twitter', [{ name: 'auth_token' }])).toBe(true);
        expect(persistedCookiesLookLikeSignedIn('twitch', [{ name: 'auth-token' }])).toBe(true);
    });

    it('is permissive for unknown site keys', () => {
        expect(persistedCookiesLookLikeSignedIn('some-custom-host', [{ name: 'any' }])).toBe(true);
    });
});
