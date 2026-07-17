/**
 * Lightweight error telemetry for the Electron main process.
 *
 * Reads `KAJO_SENTRY_DSN` from the environment. When configured, sends error
 * events to the Sentry Store HTTP API using `net.fetch` (Electron network stack).
 * When absent, errors are only written to the local structured JSON log.
 *
 * Usage:
 *   import { captureMainException } from '../lib/errorTelemetry';
 *   captureMainException(error, { source: 'site-auth' });
 */

import { net } from 'electron';
import { mainLog } from '../mainLogger';

interface SentryExceptionValue {
    type: string;
    value: string;
    stacktrace?: { frames: Array<{ filename: string; lineno: number; function: string }> };
}

interface SentryEvent {
    event_id: string;
    timestamp: string;
    platform: string;
    level: 'error' | 'warning';
    environment: string;
    extra?: Record<string, unknown>;
    exception: { values: SentryExceptionValue[] };
}

function parseDsn(dsn: string): { endpoint: string; authHeader: string } | null {
    try {
        const url = new URL(dsn);
        const projectId = url.pathname.replace(/^\//, '').replace(/\/sentry\//, '');
        const key = url.username;
        const host = url.origin;
        const endpoint = `${host}/api/${projectId}/store/`;
        const authHeader = `Sentry sentry_version=7, sentry_key=${key}`;
        return { endpoint, authHeader };
    } catch {
        return null;
    }
}

function extractStack(err: Error): Array<{ filename: string; lineno: number; function: string }> {
    const frames: Array<{ filename: string; lineno: number; function: string }> = [];
    const stack = err.stack ?? '';
    for (const line of stack.split('\n').slice(1)) {
        const m = line.trim().match(/at (.+?) \((.+?):(\d+):\d+\)/);
        if (m) {
            frames.push({
                // Capture groups are always defined when the regex matches — these fallbacks
                // are unreachable defensive values.
                /* v8 ignore start */
                function: m[1] ?? '<anonymous>',
                filename: m[2] ?? '',
                lineno: parseInt(m[3] ?? '0', 10)
                /* v8 ignore stop */
            });
        }
    }
    return frames.reverse();
}

function randomHex(bytes: number): string {
    return Array.from({ length: bytes }, () =>
        Math.floor(Math.random() * 256)
            .toString(16)
            .padStart(2, '0')
    ).join('');
}

/**
 * Send an error event from the main process to the configured Sentry DSN
 * (fire-and-forget). Swallows all network failures so telemetry never crashes
 * the main process.
 */
export function captureMainException(error: unknown, extra?: Record<string, unknown>): void {
    const dsn = process.env.KAJO_SENTRY_DSN?.trim();
    if (!dsn) return;

    const parsed = parseDsn(dsn);
    if (!parsed) {
        mainLog.warn('[errorTelemetry] KAJO_SENTRY_DSN is set but could not be parsed');
        return;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const event: SentryEvent = {
        event_id: randomHex(16),
        timestamp: new Date().toISOString(),
        platform: 'node',
        level: 'error',
        environment: process.env.NODE_ENV ?? 'production',
        ...(extra ? { extra } : {}),
        exception: {
            values: [
                {
                    type: err.name,
                    value: err.message,
                    stacktrace: { frames: extractStack(err) }
                }
            ]
        }
    };

    (net.fetch as typeof fetch)(parsed.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Sentry-Auth': parsed.authHeader
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(3_000)
    }).catch((e) => {
        mainLog.warn('[errorTelemetry] failed to send error event', { detail: String(e) });
    });
}
