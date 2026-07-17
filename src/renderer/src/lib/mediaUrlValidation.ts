import i18n from '../../../i18n/rendererI18n';
import {
    type MediaUrlResolution,
    parseHttpMediaUrl,
    resolveMediaInputUrl
} from '../../../shared/mediaUrlResolver';
import { isProhibitedAdultMediaUrl } from '../../../shared/prohibitedAdultContentHosts';
export function getMediaUrlValidationMessage(
    url: string,
    resolution?: MediaUrlResolution
): string | null {
    if (!url.trim()) {
        return null;
    }
    if (!parseHttpMediaUrl(url)) {
        return i18n.t('mediaUrlRequired', { ns: 'validation' });
    }
    if (isProhibitedAdultMediaUrl(url)) {
        return i18n.t('mediaUrlProhibitedContent', { ns: 'validation' });
    }
    const r = resolution ?? resolveMediaInputUrl(url);
    if (r.candidateMode !== 'unsupported') {
        return null;
    }
    if (r.siteProfile?.siteId === 'youtube') {
        return i18n.t('youtubeUrlUnsupported', { ns: 'validation' });
    }
    return i18n.t('mediaUrlUnsupported', { ns: 'validation' });
}
