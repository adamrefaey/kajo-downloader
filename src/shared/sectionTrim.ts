/**
 * yt-dlp `--download-sections` timestamps (hours may exceed 24 for long VODs).
 * Kept in sync with `validateTrimTimestamp` in electron downloadCapabilities.
 */
export const SECTION_TRIM_TIMESTAMP_RE: RegExp = /^(\d{1,3}):([0-5]\d):([0-5]\d)(\.\d{1,3})?$/;

export function parseSectionTrimTimestampSeconds(raw: string): number | null {
    const t = raw.trim();
    if (!t || t.length > 24) {
        return null;
    }
    const m = t.match(SECTION_TRIM_TIMESTAMP_RE);
    if (!m) {
        return null;
    }
    const h = Number(m[1]);
    const min = Number(m[2]);
    const secInt = Number(m[3]);
    const frac = m[4] ? Number(m[4]) : 0;
    const total = h * 3600 + min * 60 + secInt + frac;
    return Number.isFinite(total) ? total : null;
}

/**
 * If `raw` is a valid trim timestamp, returns the same instant with hours zero-padded to at least 2 digits
 * (e.g. `0:01:02` → `00:01:02`). Otherwise returns `raw` unchanged (partial or invalid input while editing).
 */
export function normalizeSectionTrimTimestampDisplay(raw: string): string {
    const t = raw.trim();
    if (!t) {
        return '';
    }
    const m = t.match(SECTION_TRIM_TIMESTAMP_RE);
    if (!m) {
        return raw;
    }
    const h = (m[1] ?? '00').padStart(2, '0');
    return `${h}:${m[2]}:${m[3]}${m[4] ?? ''}`;
}

/**
 * Linear estimate: trimmed output size ≈ full format size × (trim duration / full duration).
 * Returns null when inputs are unusable (invalid trim, zero duration, etc.).
 */
export function estimateBytesForSectionTrim(options: {
    fullFilesizeBytes: number;
    fullDurationSeconds: number;
    trimStart: string;
    trimEnd: string;
}): number | null {
    const { fullFilesizeBytes, fullDurationSeconds, trimStart, trimEnd } = options;
    if (!Number.isFinite(fullFilesizeBytes) || fullFilesizeBytes <= 0) {
        return null;
    }
    if (!Number.isFinite(fullDurationSeconds) || fullDurationSeconds <= 0) {
        return null;
    }
    const startSec = parseSectionTrimTimestampSeconds(trimStart);
    const endSec = parseSectionTrimTimestampSeconds(trimEnd);
    if (startSec === null || endSec === null) {
        return null;
    }
    const segmentSec = endSec - startSec;
    if (!Number.isFinite(segmentSec) || segmentSec <= 0) {
        return null;
    }
    const ratio = Math.min(1, segmentSec / fullDurationSeconds);
    return Math.max(1, Math.round(fullFilesizeBytes * ratio));
}
