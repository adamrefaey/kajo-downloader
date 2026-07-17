/**
 * Manual QA + CI matrix for universal extraction rollout (Phase 4–6).
 * Each row maps to an automated assertion in `e2e-rollout-test-matrix.test.ts`.
 *
 * Categories mirror the plan: public single, multi-item, auth-required, coarse failures, DRM/geo-style blocks.
 */

export type E2eMatrixCategory =
    | 'public-single'
    | 'multi-candidate'
    | 'auth-required'
    | 'failure-unsupported'
    | 'failure-blocked-drm-geo'
    | 'failure-policy';

export type E2eMatrixVerification =
    | 'stderr-classify'
    | 'static-url-multi-heuristic'
    | 'telemetry-payload';

export interface E2eRolloutMatrixRow {
    id: string;
    category: E2eMatrixCategory;
    summary: string;
    verification: E2eMatrixVerification;
    /** For stderr-classify rows */
    stderrSample?: string;
    expectedClassify?: 'auth-required' | 'blocked' | 'unsupported';
    /** For static-url-multi-heuristic */
    exampleUrl?: string;
    /** For telemetry-payload */
    telemetryScenario?:
        | 'single'
        | 'multi'
        | 'auth'
        | 'blocked-drm'
        | 'blocked-policy'
        | 'unsupported';
}

export const E2E_ROLLOUT_TEST_MATRIX: readonly E2eRolloutMatrixRow[] = [
    {
        id: 'pub-1',
        category: 'public-single',
        summary: 'Happy-path single resolve is classified as supported (telemetry: single / none).',
        verification: 'telemetry-payload',
        telemetryScenario: 'single'
    },
    {
        id: 'multi-1',
        category: 'multi-candidate',
        summary: 'Playlist-style YouTube URL uses multi candidate heuristic before yt-dlp.',
        verification: 'static-url-multi-heuristic',
        exampleUrl: 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
    },
    {
        id: 'multi-2',
        category: 'multi-candidate',
        summary: 'Successful multi resolve emits telemetry with resolveKind multi.',
        verification: 'telemetry-payload',
        telemetryScenario: 'multi'
    },
    {
        id: 'auth-1',
        category: 'auth-required',
        summary: 'Cookie / sign-in stderr maps to auth-required.',
        verification: 'stderr-classify',
        stderrSample: 'Private video. Sign in if you have been granted access.',
        expectedClassify: 'auth-required'
    },
    {
        id: 'auth-2',
        category: 'auth-required',
        summary: 'Explicit cookies hint maps to auth-required.',
        verification: 'stderr-classify',
        stderrSample: 'Use --cookies-from-browser or --cookies for the authentication',
        expectedClassify: 'auth-required'
    },
    {
        id: 'auth-3',
        category: 'auth-required',
        summary: 'Auth-required resolve maps to telemetry bucket auth + reason tag.',
        verification: 'telemetry-payload',
        telemetryScenario: 'auth'
    },
    {
        id: 'fail-unsup-1',
        category: 'failure-unsupported',
        summary: 'Unsupported URL / extractor miss maps to unsupported.',
        verification: 'stderr-classify',
        stderrSample: 'ERROR: Unsupported URL: https://example.invalid/foo',
        expectedClassify: 'unsupported'
    },
    {
        id: 'fail-unsup-2',
        category: 'failure-unsupported',
        summary: 'Unsupported resolve maps to extractor telemetry bucket.',
        verification: 'telemetry-payload',
        telemetryScenario: 'unsupported'
    },
    {
        id: 'drm-1',
        category: 'failure-blocked-drm-geo',
        summary: 'DRM phrasing maps to blocked (DRM-limited bucket in product copy).',
        verification: 'stderr-classify',
        stderrSample: 'This format is DRM protected',
        expectedClassify: 'blocked'
    },
    {
        id: 'drm-2',
        category: 'failure-blocked-drm-geo',
        summary: 'Geo restriction maps to blocked.',
        verification: 'stderr-classify',
        stderrSample: 'not available in your country',
        expectedClassify: 'blocked'
    },
    {
        id: 'drm-3',
        category: 'failure-blocked-drm-geo',
        summary: 'Blocked (non-policy) resolve maps to drm_or_geo telemetry bucket.',
        verification: 'telemetry-payload',
        telemetryScenario: 'blocked-drm'
    },
    {
        id: 'pol-1',
        category: 'failure-policy',
        summary: 'Prohibited-host resolve uses blocked + policy telemetry bucket.',
        verification: 'telemetry-payload',
        telemetryScenario: 'blocked-policy'
    }
];

export const E2E_MATRIX_CATEGORIES: readonly E2eMatrixCategory[] = [
    'public-single',
    'multi-candidate',
    'auth-required',
    'failure-unsupported',
    'failure-blocked-drm-geo',
    'failure-policy'
] as const;
