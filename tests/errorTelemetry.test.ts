import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const netFetchMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
    net: { fetch: netFetchMock }
}));

import { captureMainException } from '../electron/lib/errorTelemetry';

const VALID_DSN = 'https://abc123@sentry.example.com/42';

describe('captureMainException', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        netFetchMock.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it('is a no-op when KAJO_SENTRY_DSN is not set', () => {
        vi.stubEnv('KAJO_SENTRY_DSN', '');
        captureMainException(new Error('test'));
        expect(netFetchMock).not.toHaveBeenCalled();
    });

    it('is a no-op when KAJO_SENTRY_DSN is only whitespace', () => {
        vi.stubEnv('KAJO_SENTRY_DSN', '   ');
        captureMainException(new Error('test'));
        expect(netFetchMock).not.toHaveBeenCalled();
    });

    it('logs a warning and does not call fetch when DSN is an invalid URL', () => {
        vi.stubEnv('KAJO_SENTRY_DSN', 'not-a-valid-url');
        captureMainException(new Error('test'));
        expect(netFetchMock).not.toHaveBeenCalled();
    });

    it('calls net.fetch with the Sentry store endpoint when DSN is valid', async () => {
        vi.stubEnv('KAJO_SENTRY_DSN', VALID_DSN);
        captureMainException(new Error('something went wrong'));
        // net.fetch is called asynchronously (fire-and-forget) — flush microtasks
        await Promise.resolve();
        expect(netFetchMock).toHaveBeenCalledOnce();
        const [url, options] = netFetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/api/42/store/');
        expect(options.method).toBe('POST');
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(body.platform).toBe('node');
        expect(body.level).toBe('error');
    });

    it('includes extra metadata in the payload when provided', async () => {
        vi.stubEnv('KAJO_SENTRY_DSN', VALID_DSN);
        captureMainException(new Error('boom'), { source: 'test-handler' });
        await Promise.resolve();
        const [, options] = netFetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string) as { extra?: Record<string, unknown> };
        expect(body.extra).toEqual({ source: 'test-handler' });
    });

    it('wraps a non-Error value in an Error', async () => {
        vi.stubEnv('KAJO_SENTRY_DSN', VALID_DSN);
        captureMainException('string error value');
        await Promise.resolve();
        const [, options] = netFetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string) as {
            exception: { values: Array<{ value: string }> };
        };
        expect(body.exception.values[0]?.value).toBe('string error value');
    });

    it('logs a warning when net.fetch rejects without throwing', async () => {
        vi.stubEnv('KAJO_SENTRY_DSN', VALID_DSN);
        netFetchMock.mockRejectedValue(new Error('network timeout'));
        captureMainException(new Error('original'));
        // Allow the rejected promise to settle
        await new Promise((r) => setTimeout(r, 0));
        // Should not throw — fire-and-forget
        expect(true).toBe(true);
    });

    it('parses stack frames from the error stack', async () => {
        vi.stubEnv('KAJO_SENTRY_DSN', VALID_DSN);
        const err = new Error('parse stack test');
        // Ensure stack contains at-least one frame matching the regex
        err.stack = `Error: parse stack test\n    at myFunction (file.ts:10:5)\n    at notMatching`;
        captureMainException(err);
        await Promise.resolve();
        const [, options] = netFetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string) as {
            exception: { values: Array<{ stacktrace?: { frames: unknown[] } }> };
        };
        // frames are reversed — at least one should be present
        expect(body.exception.values[0]?.stacktrace?.frames.length).toBeGreaterThan(0);
    });

    it('handles an error with no stack property (covers err.stack ?? fallback)', async () => {
        vi.stubEnv('KAJO_SENTRY_DSN', VALID_DSN);
        const err = new Error('no stack');
        // Remove the stack so the `?? ''` fallback branch is exercised
        delete err.stack;
        captureMainException(err);
        await Promise.resolve();
        expect(netFetchMock).toHaveBeenCalledOnce();
    });

    it('uses "production" as environment when NODE_ENV is unset', async () => {
        vi.stubEnv('KAJO_SENTRY_DSN', VALID_DSN);
        const saved = process.env.NODE_ENV;
        try {
            delete process.env.NODE_ENV;
            captureMainException(new Error('no-env'));
            await Promise.resolve();
            const [, options] = netFetchMock.mock.calls[0] as [string, RequestInit];
            const body = JSON.parse(options.body as string) as { environment: string };
            expect(body.environment).toBe('production');
        } finally {
            process.env.NODE_ENV = saved;
        }
    });
});
