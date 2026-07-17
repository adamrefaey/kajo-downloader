/**
 * Progress values from the main process may be fractional; UI copy must show whole numbers only.
 */
export function displayProgressPercent(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(100, Math.max(0, Math.round(value)));
}
