/** Primary language subtags known to use right-to-left scripts (when we have no ICU textInfo). */
const RTL_PRIMARY = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'dv', 'ps', 'sd']);

/**
 * Whether UI for this BCP 47 tag should use `dir="rtl"`.
 * Uses `Intl.Locale` text direction when available, else a small RTL primary set.
 */
export function isRtlLocale(localeTag: string): boolean {
    const trimmed = localeTag?.trim();
    if (!trimmed) {
        return false;
    }
    try {
        const Loc = Intl.Locale as typeof Intl.Locale & {
            prototype: Intl.Locale & { textInfo?: { direction: string } };
        };
        const loc = new Loc(trimmed) as Intl.Locale & { textInfo?: { direction: string } };
        const dir = loc.textInfo?.direction;
        if (dir === 'rtl') {
            return true;
        }
        if (dir === 'ltr') {
            return false;
        }
    } catch {
        /* ignore invalid tags */
    }
    const primary = trimmed.split('-')[0]?.toLowerCase() ?? '';
    return RTL_PRIMARY.has(primary);
}
