import { describe, expect, it } from 'vitest';
import {
    advancedDownloadDefaultsToCapabilities,
    mergeAdvancedDownloadDefaultsUiPatch,
    normalizeAdvancedDownloadDefaults
} from '../src/shared/advancedDownloadSettings';
import { DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS } from '../src/types';

describe('mergeAdvancedDownloadDefaultsUiPatch', () => {
    it('deep-merges nested advanced default fields', () => {
        const base = normalizeAdvancedDownloadDefaults(undefined);
        const merged = mergeAdvancedDownloadDefaultsUiPatch(base, {
            subtitles: { mode: 'sidecar', languages: base.subtitles.languages },
            archive: { enabled: true }
        });
        expect(merged.subtitles.mode).toBe('sidecar');
        expect(merged.subtitles.languages).toEqual(base.subtitles.languages);
        expect(merged.archive.enabled).toBe(true);
        expect(merged.output).toEqual(base.output);
    });

    it('drops legacy embedding/trim keys from stored objects', () => {
        const normalized = normalizeAdvancedDownloadDefaults({
            ...DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS,
            embedding: { metadata: false, thumbnail: false, chapters: false },
            trim: { enabled: true, start: '0:00:01', end: '0:00:02' }
        });
        expect(normalized).not.toHaveProperty('embedding');
        expect(normalized).not.toHaveProperty('trim');
        expect(normalized.archive.enabled).toBe(false);
    });
});

describe('advancedDownloadDefaultsToCapabilities extensions', () => {
    it('maps archive when enabled and does not emit embedding', () => {
        const defaults = normalizeAdvancedDownloadDefaults({
            ...DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS,
            archive: { enabled: true }
        });
        const caps = advancedDownloadDefaultsToCapabilities(defaults);
        expect(caps.archive).toEqual({ enabled: true });
        expect(caps.embedding).toBeUndefined();
    });
});
