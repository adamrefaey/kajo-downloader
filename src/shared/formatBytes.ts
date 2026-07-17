/**
 * Human-readable byte formatting (1024-based), shared by renderer and main-process download progress.
 */
export function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Parses yt-dlp `[download] … of <this> at …` fragment (e.g. `12.34MiB`, `1.00 GiB`).
 */
export function parseYtDlpOfTotalToBytes(fragment: string): number | undefined {
    const s = fragment.trim();
    if (!s || s === '--') {
        return undefined;
    }
    const m = s.match(/^([\d.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)?$/i);
    if (!m) {
        return undefined;
    }
    const n = Number.parseFloat(m[1] ?? '');
    if (!Number.isFinite(n) || n < 0) {
        return undefined;
    }
    const u = (m[2] ?? 'B').toLowerCase();
    const mult: Record<string, number> = {
        b: 1,
        kib: 1024,
        kb: 1024,
        mib: 1024 ** 2,
        mb: 1024 ** 2,
        gib: 1024 ** 3,
        gb: 1024 ** 3,
        tib: 1024 ** 4,
        tb: 1024 ** 4
    };
    const factor = mult[u];
    if (factor === undefined) {
        return undefined;
    }
    return Math.round(n * factor);
}
