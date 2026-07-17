import i18n from '../../../i18n/rendererI18n';
import { isMultilineBatchInput } from '../../../shared/batchUrlInput';
import { parseHttpMediaUrl, resolveMediaInputUrl } from '../../../shared/mediaUrlResolver';
import { isProhibitedAdultMediaUrl } from '../../../shared/prohibitedAdultContentHosts';

/**
 * Validates a multiline batch (two+ lines). Returns null when every line is a supported media URL
 * (single video, playlist, or channel, per site rules).
 */
export function getMultilineBatchValidationMessage(lines: string[]): string | null {
    if (!isMultilineBatchInput(lines)) {
        return null;
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) {
            continue;
        }
        const lineNum = i + 1;
        if (!parseHttpMediaUrl(line)) {
            return i18n.t('multilineBatchLineInvalid', { ns: 'validation', line: lineNum });
        }
        if (isProhibitedAdultMediaUrl(line)) {
            return i18n.t('multilineBatchLineProhibited', { ns: 'validation', line: lineNum });
        }
        const r = resolveMediaInputUrl(line);
        if (r.candidateMode === 'unsupported') {
            return r.siteProfile?.siteId === 'youtube'
                ? i18n.t('multilineBatchLineYoutubeUnsupported', {
                      ns: 'validation',
                      line: lineNum
                  })
                : i18n.t('multilineBatchLineUnsupported', { ns: 'validation', line: lineNum });
        }
    }
    return null;
}
