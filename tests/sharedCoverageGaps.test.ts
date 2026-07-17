import { describe, expect, it } from 'vitest';
import { estimateDownloadFullBytesFromDuration } from '../src/shared/estimateDownloadFullBytes';
import {
    createIpcInvokeTimeoutError,
    IPC_INVOKE_TIMEOUT_ERROR_PREFIX,
    isIpcInvokeTimeoutError
} from '../src/shared/ipcErrors';
import {
    parseSearchIpcPayload,
    reportRendererErrorPayloadSchema,
    siteAuthOpenPayloadSchema
} from '../src/shared/ipcPayloadSchemas';
import { resolveSiteCookieStorageKey, sanitizeSiteStorageKey } from '../src/shared/siteAuthKeys';

describe('shared coverage gaps', () => {
    describe('estimateDownloadFullBytesFromDuration', () => {
        it('returns 0 for invalid duration', () => {
            expect(estimateDownloadFullBytesFromDuration({ durationSeconds: 0 })).toBe(0);
            expect(estimateDownloadFullBytesFromDuration({ durationSeconds: Number.NaN })).toBe(0);
        });

        it('scales by audio-only and height tiers', () => {
            expect(
                estimateDownloadFullBytesFromDuration({ durationSeconds: 10, audioOnly: true })
            ).toBeGreaterThan(0);
            expect(
                estimateDownloadFullBytesFromDuration({ durationSeconds: 10, videoHeight: 360 })
            ).toBeLessThan(
                estimateDownloadFullBytesFromDuration({ durationSeconds: 10, videoHeight: 2160 })
            );
        });
    });

    describe('ipcErrors timeout helpers', () => {
        it('creates and detects invoke timeout errors', () => {
            const err = createIpcInvokeTimeoutError('settings:get');
            expect(err.message).toBe(`${IPC_INVOKE_TIMEOUT_ERROR_PREFIX}settings:get`);
            expect(isIpcInvokeTimeoutError(err)).toBe(true);
            expect(isIpcInvokeTimeoutError(new Error('other'))).toBe(false);
        });
    });

    describe('siteAuthKeys', () => {
        it('sanitizes storage keys and resolves from url/profile/siteId', () => {
            expect(sanitizeSiteStorageKey('  Hello World!! ')).toBe('hello-world');
            expect(sanitizeSiteStorageKey('   ')).toBe('site');
            expect(
                resolveSiteCookieStorageKey({
                    url: 'https://www.youtube.com/watch?v=x',
                    siteId: 'youtube'
                })
            ).toBe('youtube');
            expect(
                resolveSiteCookieStorageKey({
                    url: 'https://app.acme.corp.local/v',
                    siteDomain: ''
                })
            ).toBe('app-acme-corp-local');
            expect(resolveSiteCookieStorageKey({ url: '://bad', siteDomain: '' })).toBe('unknown');
        });
    });

    describe('ipcPayloadSchemas extras', () => {
        it('rejects dangerous siteAuth initialUrl schemes', () => {
            expect(
                siteAuthOpenPayloadSchema.safeParse({ initialUrl: 'javascript:alert(1)' }).success
            ).toBe(false);
            expect(
                siteAuthOpenPayloadSchema.safeParse({ initialUrl: 'https://youtube.com' }).success
            ).toBe(true);
        });

        it('applies reportRendererError defaults', () => {
            expect(reportRendererErrorPayloadSchema.parse({})).toEqual({
                message: 'Renderer error',
                source: 'renderer'
            });
        });

        it('parseSearchIpcPayload returns null when object schema fails', () => {
            expect(parseSearchIpcPayload(['bad', 'array'])).toBeNull();
        });
    });
});
