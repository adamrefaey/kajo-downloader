import { describe, expect, it } from 'vitest';
import { deriveCanQuickStartDownload } from '../src/renderer/src/app/controller/useAppWorkflowDerived';
import { resolveMediaInputUrl } from '../src/shared/mediaUrlResolver';

const youtubeUrl = 'https://www.youtube.com/watch?v=2nLciKQE4pY';

function quickStartInputs(
    overrides: Partial<Parameters<typeof deriveCanQuickStartDownload>[0]> = {}
): Parameters<typeof deriveCanQuickStartDownload>[0] {
    return {
        multilineBatchMode: false,
        isBatchUrl: false,
        videoInfo: null,
        metadataResolve: {
            kind: 'single',
            url: youtubeUrl,
            siteId: 'youtube',
            candidateMode: 'single'
        },
        metadataResolvePending: false,
        urlResolution: resolveMediaInputUrl(youtubeUrl),
        settingsOutputDir: '/tmp/out',
        isStartingDownload: false,
        setupYtdlpReady: true,
        urlValidationError: null,
        trimmedUrl: youtubeUrl,
        isFetchingInfo: true,
        ...overrides
    };
}

describe('deriveCanQuickStartDownload', () => {
    it('enables quick start while metadata fetch is in flight', () => {
        expect(deriveCanQuickStartDownload(quickStartInputs())).toBe(true);
    });

    it('disables quick start once video info is available', () => {
        expect(
            deriveCanQuickStartDownload(
                quickStartInputs({
                    videoInfo: {
                        id: 'x',
                        url: youtubeUrl,
                        title: 'Title',
                        channel: 'Channel',
                        durationSeconds: 10,
                        thumbnailUrl: '',
                        formats: []
                    },
                    isFetchingInfo: false
                })
            )
        ).toBe(false);
    });

    it('allows quick start while resolve is pending for client-side single URLs', () => {
        expect(
            deriveCanQuickStartDownload(
                quickStartInputs({
                    metadataResolve: null,
                    metadataResolvePending: true,
                    isFetchingInfo: false
                })
            )
        ).toBe(true);
    });

    it('blocks quick start for batch URLs', () => {
        expect(
            deriveCanQuickStartDownload(
                quickStartInputs({
                    isBatchUrl: true,
                    metadataResolve: {
                        kind: 'multi',
                        url: 'https://www.youtube.com/playlist?list=PLx',
                        entryCount: 2,
                        candidates: [],
                        candidateMode: 'multi'
                    }
                })
            )
        ).toBe(false);
    });
});
