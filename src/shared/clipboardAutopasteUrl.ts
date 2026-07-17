import { parseBatchUrlLines } from './batchUrlInput';
import { youtubeSingleVideoUrlsPointToSameMedia } from './youtubeUrlEquivalence';

/**
 * True when two clipboard-derived URLs should be treated as the same for autopaste
 * (avoid refilling the field when only normalization differs).
 */
export function clipboardAutopasteUrlsEquivalent(a: string, b: string): boolean {
    if (youtubeSingleVideoUrlsPointToSameMedia(a, b)) {
        return true;
    }
    const ta = a.trim();
    const tb = b.trim();
    if (!ta || !tb) {
        return ta === tb;
    }
    try {
        const ua = new URL(ta.includes('://') ? ta : `https://${ta}`);
        const ub = new URL(tb.includes('://') ? tb : `https://${tb}`);
        if (ua.protocol !== 'http:' && ua.protocol !== 'https:') {
            return false;
        }
        if (ub.protocol !== 'http:' && ub.protocol !== 'https:') {
            return false;
        }
        const hostA = ua.host.toLowerCase().replace(/^www\./i, '');
        const hostB = ub.host.toLowerCase().replace(/^www\./i, '');
        if (hostA !== hostB) {
            return false;
        }
        const pa = ua.pathname.replace(/\/$/, '') || '/';
        const pb = ub.pathname.replace(/\/$/, '') || '/';
        return pa === pb && ua.search === ub.search;
    } catch {
        return ta === tb;
    }
}

/** Same as {@link clipboardAutopasteUrlsEquivalent} for a single URL, or line-by-line for batch input. */
export function clipboardAutopasteClipboardTextsEquivalent(a: string, b: string): boolean {
    const la = parseBatchUrlLines(a);
    const lb = parseBatchUrlLines(b);
    if (la.length !== lb.length) {
        return false;
    }
    if (la.length === 0) {
        return true;
    }
    for (let i = 0; i < la.length; i += 1) {
        if (!clipboardAutopasteUrlsEquivalent(la[i] ?? '', lb[i] ?? '')) {
            return false;
        }
    }
    return true;
}
