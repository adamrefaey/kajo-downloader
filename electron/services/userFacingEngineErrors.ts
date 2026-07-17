/** Strip internal binary names from strings shown in the app UI. */
const INTERNAL_ENGINE_NAMES = /\byt-dlp\b|\byt_dlp\b|\bytdlp\b|\bffmpeg\b/gi;

export function stripInternalEngineNames(text: string): string {
    return text
        .replace(INTERNAL_ENGINE_NAMES, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .trim();
}

const MIN_MEANINGFUL_MESSAGE_LEN = 4;

/**
 * Last stderr line from the download engine, or empty — never includes internal tool names.
 */
export function userFacingDownloadFailureMessage(lastStderrLine: string | undefined): string {
    const raw = (lastStderrLine ?? '').trim();
    const cleaned = stripInternalEngineNames(raw)
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (cleaned.length >= MIN_MEANINGFUL_MESSAGE_LEN) {
        return cleaned;
    }
    return 'The download could not be completed.';
}

/** Last stderr line from a metadata / URL probe, sanitized for UI. */
export function userFacingMetadataProbeMessage(lastStderrLine: string): string {
    const cleaned = stripInternalEngineNames(lastStderrLine.trim())
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (cleaned.length >= MIN_MEANINGFUL_MESSAGE_LEN) {
        return cleaned;
    }
    return 'Could not load details for this link.';
}
