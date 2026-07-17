/**
 * Returns true when `v` is a plain object (not null, not an array).
 * Narrows the type to `Record<string, unknown>` to enable safe property access.
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
