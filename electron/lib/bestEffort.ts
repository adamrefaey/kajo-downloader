import { mainLog } from '../mainLogger';

/**
 * Attaches a `.catch()` to a best-effort async operation so that failures are
 * logged at debug level instead of being silently swallowed.
 *
 * Usage:
 * ```ts
 * bestEffort('rm temp file', rm(wavPath, { force: true }));
 * ```
 *
 * The returned promise resolves to `void` — callers should not await it
 * unless they specifically want to wait for the operation.
 */
export function bestEffort(label: string, promise: Promise<unknown>): void {
    promise.catch((err: unknown) => {
        mainLog.debug(`[bestEffort] ${label} failed`, { err: String(err) });
    });
}
