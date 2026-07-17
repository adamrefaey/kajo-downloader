import { describe, expect, it } from 'vitest';
import {
    isCookieDomainAllowedForSiteAuth,
    isHostnameAllowedForSiteAuthSession,
    listAllowedDomainSuffixesForSiteAuth
} from '../src/shared/siteAuthDomains';
import { getSiteProfileBySiteId } from '../src/shared/siteProfiles';

describe('siteAuthDomains', () => {
    const youtube = getSiteProfileBySiteId('youtube');

    it('allows profile domains and youtube google oauth hosts', () => {
        expect(isHostnameAllowedForSiteAuthSession('www.youtube.com', youtube, 'youtube.com')).toBe(
            true
        );
        expect(
            isHostnameAllowedForSiteAuthSession('accounts.google.com', youtube, 'youtube.com')
        ).toBe(true);
        expect(isHostnameAllowedForSiteAuthSession('evil.com', youtube, 'youtube.com')).toBe(false);
    });

    it('falls back to root host when profile is unknown', () => {
        expect(
            isHostnameAllowedForSiteAuthSession('app.example.com', undefined, 'example.com')
        ).toBe(true);
        expect(isHostnameAllowedForSiteAuthSession('', undefined, 'example.com')).toBe(false);
        expect(isHostnameAllowedForSiteAuthSession('other.com', undefined, '')).toBe(false);
    });

    it('lists allowed suffixes for youtube and unknown profiles', () => {
        const ytSuffixes = listAllowedDomainSuffixesForSiteAuth(youtube, 'youtube.com');
        expect(ytSuffixes).toContain('youtube.com');
        expect(ytSuffixes).toContain('google.com');
        expect(listAllowedDomainSuffixesForSiteAuth(undefined, 'Custom.Root')).toEqual([
            'custom.root'
        ]);
        expect(listAllowedDomainSuffixesForSiteAuth(undefined, '   ')).toEqual([]);
    });

    it('matches cookie domains against allowlists', () => {
        const allowed = ['youtube.com', 'google.com'];
        expect(isCookieDomainAllowedForSiteAuth('.youtube.com', allowed)).toBe(true);
        expect(isCookieDomainAllowedForSiteAuth('google.co.uk', allowed)).toBe(false);
        expect(isCookieDomainAllowedForSiteAuth('', allowed)).toBe(false);
        expect(isCookieDomainAllowedForSiteAuth('.youtube.com', [])).toBe(false);
    });
});
