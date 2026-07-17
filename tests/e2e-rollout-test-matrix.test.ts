/**
 * CI-safe extraction rollout matrix (no live yt-dlp network calls).
 * Pairs with `tests/lib/e2eRolloutTestMatrix.ts` for QA traceability.
 */
import { describe, expect, it } from 'vitest';
import { classifyMetadataResolveStderr } from '../electron/services/metadata/errorClassification';
import { buildStaticMetadataResolveContext } from '../src/shared/urlSiteResolveContext';
import {
    E2E_MATRIX_CATEGORIES,
    E2E_ROLLOUT_TEST_MATRIX,
    type E2eRolloutMatrixRow
} from './lib/e2eRolloutTestMatrix';

function categoriesCovered(rows: readonly E2eRolloutMatrixRow[]): Set<string> {
    return new Set(rows.map((r) => r.category));
}

describe('E2E rollout test matrix coverage', () => {
    it('includes every matrix category at least once', () => {
        const covered = categoriesCovered(E2E_ROLLOUT_TEST_MATRIX);
        for (const c of E2E_MATRIX_CATEGORIES) {
            expect(covered.has(c), `missing category: ${c}`).toBe(true);
        }
    });

    it('classifies stderr fixtures per matrix rows', () => {
        const rows = E2E_ROLLOUT_TEST_MATRIX.filter((r) => r.verification === 'stderr-classify');
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            const sample = row.stderrSample;
            if (!sample) {
                throw new Error(`${row.id}: missing stderrSample`);
            }
            expect(classifyMetadataResolveStderr(sample)).toBe(row.expectedClassify);
        }
    });

    it('marks known multi-item URLs via static context', () => {
        const rows = E2E_ROLLOUT_TEST_MATRIX.filter(
            (r) => r.verification === 'static-url-multi-heuristic'
        );
        for (const row of rows) {
            const u = row.exampleUrl;
            if (!u) {
                throw new Error(`${row.id}: missing exampleUrl`);
            }
            const ctx = buildStaticMetadataResolveContext(u);
            expect(ctx.candidateMode, row.id).toBe('multi');
        }
    });
});
