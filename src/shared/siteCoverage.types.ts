/** Row from `yt-dlp --list-extractors` (see `scripts/generate-site-coverage.mjs`). */
export interface SiteCoverageExtractorRow {
    key: string;
    broken: boolean;
}

/** Curated rollout slot checked against the extractor catalog. */
export interface SiteCoverageRolloutRow {
    siteId: string;
    rank: number;
    demandScore: number;
    primaryExtractorKey: string;
    extractorPresent: boolean;
}

/**
 * Shape of `src/shared/generated/siteCoverage.v1.json`.
 *
 * `extractors` mirrors yt-dlp’s full extractor list (including extractors for sites blocked
 * in-app). Product policy is applied at URL validation (`prohibitedAdultContentHosts.ts`), not
 * by omitting rows here. Tests assert `rolloutTop20` matches `SITE_PROFILES`.
 */
export interface SiteCoverageV1 {
    schemaVersion: 1;
    generatedAt: string;
    ytdlpVersion: string;
    referencedMinYtdlpVersion: string;
    extractorCount: number;
    extractors: SiteCoverageExtractorRow[];
    rolloutTop20: SiteCoverageRolloutRow[];
}
