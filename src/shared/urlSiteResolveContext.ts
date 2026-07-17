import type { MetadataResolveContextFields } from '../types';
import { resolveMediaInputUrl } from './mediaUrlResolver';
import {
    GENERIC_YTDLP_SITE_ID,
    getSiteProfileByExtractorKeyLoose,
    getSiteProfileByHostOrUrl
} from './siteProfiles';

function normalizeSiteDomain(rawInput: string): string | undefined {
    const trimmed = rawInput.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
        return new URL(withScheme).hostname.toLowerCase();
    } catch {
        return undefined;
    }
}

/**
 * Host profile + single/multi heuristic from the URL alone (no yt-dlp round-trip).
 */
export function buildStaticMetadataResolveContext(rawInput: string): MetadataResolveContextFields {
    const trimmed = rawInput.trim();
    const media = resolveMediaInputUrl(trimmed);
    const siteDomain = normalizeSiteDomain(trimmed);
    const profile = media.siteProfile ?? getSiteProfileByHostOrUrl(trimmed);

    return {
        siteId: profile?.siteId,
        siteDomain,
        extractorKey: undefined,
        candidateMode: media.candidateMode,
        youtubeBatchKind: media.youtubeBatchKind,
        authCookiesRecommended: profile?.supportsAuth === true
    };
}

/**
 * Merges yt-dlp `--dump-json` / `--dump-single-json` `extractor` / `extractor_key` into resolve context.
 */
export function refineMetadataResolveContextWithExtractor(
    base: MetadataResolveContextFields,
    ytDlpExtractorKey?: string | null
): MetadataResolveContextFields {
    const key = ytDlpExtractorKey?.trim();
    if (!key) {
        return base;
    }
    const siteId =
        base.siteId ?? getSiteProfileByExtractorKeyLoose(key)?.siteId ?? GENERIC_YTDLP_SITE_ID;
    return {
        ...base,
        extractorKey: key,
        siteId
    };
}
