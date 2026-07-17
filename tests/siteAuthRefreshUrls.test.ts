import { describe, expect, it } from 'vitest';
import { resolveSiteSessionRefreshSeedUrl } from '../src/shared/siteAuthRefreshUrls';

describe('siteAuthRefreshUrls', () => {
    it('resolveSiteSessionRefreshSeedUrl returns profile home URL for youtube', () => {
        expect(resolveSiteSessionRefreshSeedUrl('youtube')).toBe('https://youtube.com');
    });

    it('resolveSiteSessionRefreshSeedUrl returns null for unknown slug without domain label', () => {
        expect(resolveSiteSessionRefreshSeedUrl('not-a-real-profile-key-xyz')).toBeNull();
    });

    it('resolveSiteSessionRefreshSeedUrl uses domain label for unknown storage key when dotted', () => {
        expect(resolveSiteSessionRefreshSeedUrl('custom-slug-from-host', 'example.org')).toBe(
            'https://example.org/'
        );
    });
});
