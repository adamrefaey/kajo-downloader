import { isAbsolute, normalize, resolve } from 'node:path';

/**
 * True when `candidate` is a non-empty absolute filesystem path suitable as a
 * download root (no NUL, no relative segments that would rely on cwd).
 */
export function isAcceptableOutputDir(candidate: string): boolean {
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.includes('\0')) {
        return false;
    }
    return isAbsolute(trimmed);
}

/**
 * Normalize a trusted output directory. Invalid / relative / empty values fall
 * back to `fallback` (typically `app.getPath('downloads')`).
 */
export function resolveTrustedOutputDir(candidate: unknown, fallback: string): string {
    const fallbackResolved = normalize(resolve(fallback));
    if (typeof candidate !== 'string' || !isAcceptableOutputDir(candidate)) {
        return fallbackResolved;
    }
    return normalize(resolve(candidate.trim()));
}
