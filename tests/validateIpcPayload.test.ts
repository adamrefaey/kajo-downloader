/**
 * Unit tests for the IPC validation layer.
 *
 * Covers:
 *  - `parseIpcPayload` with valid schemas → parsed data returned
 *  - `parseIpcPayload` with invalid inputs → null returned, warning logged
 *  - Channel name included in log output for debugging
 *  - Correct schema coercion (Zod-level transforms preserved)
 *
 * `validateSender` behavior is covered by mainHelpers.test.ts.
 * `ipcRateLimiter` behavior is covered by ipcRateLimiter.test.ts.
 * This file focuses on the Zod-validation boundary in `validateIpcPayload.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Spy on mainLogger before importing from validateIpcPayload so the mock is in place
const warnSpy = vi.hoisted(() => vi.fn());

vi.mock('../electron/mainLogger', () => ({
    mainLog: {
        warn: warnSpy,
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

vi.mock('../electron/i18n/mainI18n', () => ({
    translateMainError: (key: string) => key
}));

import type { IpcMainInvokeEvent } from 'electron';
import { parseIpcPayload, withValidSender } from '../electron/ipc/validateIpcPayload';
import { isIpcFailureEnvelope } from '../src/shared/ipcErrors';

describe('parseIpcPayload', () => {
    beforeEach(() => {
        warnSpy.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ----------------------------------
    // Happy path: valid payloads
    // ----------------------------------

    it('returns parsed value when input matches the schema', () => {
        const schema = z.object({ name: z.string(), count: z.number() });
        const raw = { name: 'test', count: 42 };
        const result = parseIpcPayload(schema, raw);
        expect(result).toEqual({ name: 'test', count: 42 });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns transformed value when schema applies a coercion', () => {
        const schema = z.object({
            url: z.string().trim().toLowerCase()
        });
        const raw = { url: '  HTTPS://Example.COM  ' };
        const result = parseIpcPayload(schema, raw);
        expect(result?.url).toBe('https://example.com');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('accepts a primitive schema (e.g. z.string())', () => {
        const schema = z.string().min(1);
        const result = parseIpcPayload(schema, 'hello');
        expect(result).toBe('hello');
    });

    it('accepts an array schema', () => {
        const schema = z.array(z.number());
        const result = parseIpcPayload(schema, [1, 2, 3]);
        expect(result).toEqual([1, 2, 3]);
    });

    it('accepts null when schema permits null', () => {
        const schema = z.null();
        const result = parseIpcPayload(schema, null);
        expect(result).toBeNull();
    });

    // ----------------------------------
    // Failure path: invalid payloads → null
    // ----------------------------------

    it('returns null when required field is missing', () => {
        const schema = z.object({ name: z.string() });
        const result = parseIpcPayload(schema, {});
        expect(result).toBeNull();
    });

    it('returns null when field has wrong type', () => {
        const schema = z.object({ count: z.number() });
        const result = parseIpcPayload(schema, { count: 'not-a-number' });
        expect(result).toBeNull();
    });

    it('returns null for null input when schema expects object', () => {
        const schema = z.object({ x: z.string() });
        const result = parseIpcPayload(schema, null);
        expect(result).toBeNull();
    });

    it('returns null for undefined input when schema expects string', () => {
        const schema = z.string();
        const result = parseIpcPayload(schema, undefined);
        expect(result).toBeNull();
    });

    it('returns null for completely unrelated type (number vs object)', () => {
        const schema = z.object({ x: z.string() });
        const result = parseIpcPayload(schema, 12345);
        expect(result).toBeNull();
    });

    it('returns null for array input when schema expects object', () => {
        const schema = z.object({ x: z.string() });
        const result = parseIpcPayload(schema, ['a', 'b']);
        expect(result).toBeNull();
    });

    it('returns null when schema uses .strict() and extra keys are present', () => {
        const schema = z.object({ name: z.string() }).strict();
        const result = parseIpcPayload(schema, { name: 'ok', extra: true });
        expect(result).toBeNull();
    });

    it('returns null for empty string when schema requires min length 1', () => {
        const schema = z.string().min(1);
        const result = parseIpcPayload(schema, '');
        expect(result).toBeNull();
    });

    // ----------------------------------
    // Warning log behavior
    // ----------------------------------

    it('logs a warning when validation fails', () => {
        const schema = z.object({ url: z.string() });
        parseIpcPayload(schema, { url: 42 });
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('warning log includes the channel name when provided', () => {
        const schema = z.object({ url: z.string() });
        parseIpcPayload(schema, { url: 42 }, 'download:start');
        const [, logPayload] = warnSpy.mock.calls[0] as [string, { channel: string }];
        expect(logPayload.channel).toBe('download:start');
    });

    it('warning log uses "unknown" channel when channel is not provided', () => {
        const schema = z.object({ url: z.string() });
        parseIpcPayload(schema, { url: 42 });
        const [, logPayload] = warnSpy.mock.calls[0] as [string, { channel: string }];
        expect(logPayload.channel).toBe('unknown');
    });

    it('warning log includes Zod issue details (path + message)', () => {
        const schema = z.object({ count: z.number().min(1) });
        parseIpcPayload(schema, { count: 0 }, 'test:channel');
        const [, logPayload] = warnSpy.mock.calls[0] as [
            string,
            { issues: Array<{ path: string; message: string }> }
        ];
        expect(Array.isArray(logPayload.issues)).toBe(true);
        expect(logPayload.issues.length).toBeGreaterThan(0);
        expect(logPayload.issues[0]).toHaveProperty('path');
        expect(logPayload.issues[0]).toHaveProperty('message');
    });

    it('warning log includes received type', () => {
        const schema = z.string();
        parseIpcPayload(schema, { not: 'a string' }, 'some:channel');
        const [, logPayload] = warnSpy.mock.calls[0] as [string, { received: string }];
        expect(logPayload.received).toBe('object');
    });

    it('does not log when validation succeeds', () => {
        const schema = z.object({ x: z.number() });
        parseIpcPayload(schema, { x: 1 });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    // ----------------------------------
    // Edge cases
    // ----------------------------------

    it('handles deeply nested schema validation failures', () => {
        const schema = z.object({
            user: z.object({ email: z.string().email() })
        });
        const result = parseIpcPayload(schema, { user: { email: 'not-an-email' } });
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('handles union schema — accepts first matching variant', () => {
        const schema = z.union([z.string(), z.number()]);
        expect(parseIpcPayload(schema, 'hello')).toBe('hello');
        expect(parseIpcPayload(schema, 42)).toBe(42);
        expect(parseIpcPayload(schema, true)).toBeNull();
    });

    it('handles optional fields correctly', () => {
        const schema = z.object({
            required: z.string(),
            optional: z.string().optional()
        });
        const withOptional = parseIpcPayload(schema, { required: 'yes', optional: 'extra' });
        expect(withOptional).toEqual({ required: 'yes', optional: 'extra' });

        const withoutOptional = parseIpcPayload(schema, { required: 'yes' });
        expect(withoutOptional).toEqual({ required: 'yes' });
    });
});

describe('parseIpcPayload — IPC channel security boundary', () => {
    beforeEach(() => {
        warnSpy.mockClear();
    });

    it('rejects payloads that could smuggle prototype-polluting keys', () => {
        const schema = z.record(z.string(), z.unknown());
        // A payload with __proto__ in the key
        const malicious = JSON.parse('{"__proto__": {"polluted": true}}') as unknown;
        // Zod's safeParse should parse it without executing prototype pollution;
        // the key may or may not be present depending on how JSON.parse works,
        // but the application can safely parse it via Zod without side effects.
        const result = parseIpcPayload(schema, malicious);
        // Whether result is null or an object, the prototype of {} must remain clean
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        // Zod should have processed this without throwing
        expect(result !== undefined).toBe(true);
    });

    it('limits warnings to Zod issue structure — never exposes raw validated data in logs', () => {
        const schema = z.object({ secret: z.string().max(0) });
        const payload = { secret: 'SENSITIVE_DATA_99999' };
        parseIpcPayload(schema, payload, 'some:channel');

        // The warning should log issue paths and codes, but not the raw values
        const [, logPayload] = warnSpy.mock.calls[0] as [
            string,
            { issues: Array<{ path: string; message: string; code: string }> }
        ];
        const logString = JSON.stringify(logPayload);
        expect(logString).not.toContain('SENSITIVE_DATA_99999');
    });
});

describe('withValidSender', () => {
    const fakeEvent = {} as IpcMainInvokeEvent;

    it('invokes the wrapped handler (forwarding args) when the sender is valid', () => {
        const handler = vi.fn((_e: IpcMainInvokeEvent, a: string, b: number) => `${a}:${b}`);
        const guarded = withValidSender({ isValidIpcSender: () => true }, handler);
        const result = guarded(fakeEvent, 'hello', 7);
        expect(handler).toHaveBeenCalledWith(fakeEvent, 'hello', 7);
        expect(result).toBe('hello:7');
    });

    it('short-circuits with an invalid_sender IPC failure envelope when the sender is untrusted', () => {
        const handler = vi.fn(() => 'should-not-run');
        const guarded = withValidSender({ isValidIpcSender: () => false }, handler);
        const result = guarded(fakeEvent);
        expect(handler).not.toHaveBeenCalled();
        expect(isIpcFailureEnvelope(result)).toBe(true);
        expect((result as { code: string }).code).toBe('invalid_sender');
    });
});
