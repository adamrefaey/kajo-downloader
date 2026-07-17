import { normalize, resolve, sep } from 'node:path';

/**
 * Returns true when `candidate` resolves to `root` or a path strictly under `root`.
 * Handles trailing separators and platform-specific normalization (including Windows drive letters).
 */
export function isPathInsideRoot(root: string, candidate: string): boolean {
    // Empty/whitespace roots must not collapse to `process.cwd()` via `resolve`.
    if (!root.trim()) {
        return false;
    }
    const resolvedRoot = normalize(resolve(root));
    const resolvedCandidate = normalize(resolve(candidate));
    if (resolvedCandidate === resolvedRoot) {
        return true;
    }
    const rootPrefix = `${resolvedRoot}${sep}`;
    if (process.platform === 'win32') {
        return resolvedCandidate.toLowerCase().startsWith(rootPrefix.toLowerCase());
    }
    return resolvedCandidate.startsWith(rootPrefix);
}
