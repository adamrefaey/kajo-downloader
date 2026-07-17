import { describe, expect, it } from 'vitest';
import {
    isAuthRequiredMediaError,
    queueSiteFieldsFromMediaUrl,
    queueSiteFieldsFromResolve
} from '../src/renderer/src/lib/queueSiteHelpers';
import type { MetadataResolveResult } from '../src/types';

describe('queueSiteHelpers', () => {
    it('isAuthRequiredMediaError matches known phrases', () => {
        expect(isAuthRequiredMediaError('Private video')).toBe(true);
        expect(isAuthRequiredMediaError('Sign in to confirm your age')).toBe(true);
        expect(isAuthRequiredMediaError("Sign in to confirm you're not a bot")).toBe(true);
        expect(isAuthRequiredMediaError('Use --cookies-from-browser or --cookies')).toBe(true);
        expect(isAuthRequiredMediaError('members-only')).toBe(true);
        expect(isAuthRequiredMediaError('subscriber-only')).toBe(true);
        expect(isAuthRequiredMediaError('needs_auth')).toBe(true);
        expect(isAuthRequiredMediaError(null)).toBe(false);
    });

    it('queueSiteFieldsFromMediaUrl extracts host and profile', () => {
        const f = queueSiteFieldsFromMediaUrl('https://www.youtube.com/watch?v=1', {
            extractorKey: 'youtube',
            authRequired: true
        });
        expect(f.siteDomain).toContain('youtube');
        expect(f.extractorKey).toBe('youtube');
        expect(f.authRequired).toBe(true);
    });

    it('queueSiteFieldsFromMediaUrl ignores bad URLs', () => {
        expect(queueSiteFieldsFromMediaUrl('not-a-url')).toEqual({});
    });

    it('queueSiteFieldsFromResolve merges resolve context', () => {
        const resolve = {
            kind: 'auth-required' as const,
            url: 'https://www.youtube.com/watch?v=1',
            candidateMode: 'single' as const,
            authCookiesRecommended: false,
            siteId: 'youtube',
            siteDomain: 'www.youtube.com',
            extractorKey: 'youtube'
        } satisfies MetadataResolveResult;
        const base = queueSiteFieldsFromResolve(resolve, 'https://www.youtube.com/watch?v=1', {
            extractorKey: 'override'
        });
        expect(base.siteId).toBe('youtube');
        expect(base.authRequired).toBe(true);
        expect(base.extractorKey).toBe('override');
        expect(queueSiteFieldsFromResolve(null, 'https://youtu.be/x')).toMatchObject({
            siteDomain: expect.stringContaining('youtu')
        });
    });

    it('queueSiteFieldsFromResolve applies siteDomain and resolve extractor when no override', () => {
        const resolve = {
            kind: 'single' as const,
            url: 'https://x.com/v',
            candidateMode: 'single' as const,
            siteDomain: 'x.com',
            extractorKey: 'X'
        } satisfies MetadataResolveResult;
        const f = queueSiteFieldsFromResolve(resolve, 'https://x.com/v');
        expect(f.siteDomain).toBe('x.com');
        expect(f.extractorKey).toBe('X');
    });

    it('queueSiteFieldsFromResolve sets auth for auth-required without site fields', () => {
        const resolve = {
            kind: 'auth-required' as const,
            url: 'https://z.com',
            candidateMode: 'unsupported' as const
        } satisfies MetadataResolveResult;
        const f = queueSiteFieldsFromResolve(resolve, 'https://z.com');
        expect(f.authRequired).toBe(true);
    });
});
