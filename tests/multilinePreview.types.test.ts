import { describe, expect, it } from 'vitest';
import {
    type MultilinePreviewRowState,
    multilineRowIsDownloadReady
} from '../src/renderer/src/app/multilinePreview.types';

function baseRow(partial: Partial<MultilinePreviewRowState>): MultilinePreviewRowState {
    return {
        lineIndex: 0,
        inputUrl: 'https://a.com',
        resolvePending: false,
        fetchPending: false,
        metadataResolve: null,
        videoInfo: null,
        errorMessage: null,
        selectedFormatId: '',
        audioOnly: false,
        multiBatchQueued: false,
        youtubeWatchPlaylistChoice: null,
        channelQueueVideos: true,
        channelQueueShorts: false,
        channelQueueLive: false,
        ...partial
    };
}

describe('multilineRowIsDownloadReady', () => {
    it('is false while resolving or fetching', () => {
        expect(
            multilineRowIsDownloadReady(
                baseRow({
                    resolvePending: true,
                    metadataResolve: {
                        kind: 'single',
                        url: 'https://a.com'
                    } as MultilinePreviewRowState['metadataResolve'],
                    videoInfo: {} as unknown as MultilinePreviewRowState['videoInfo'],
                    selectedFormatId: 'x'
                })
            )
        ).toBe(false);
    });

    it('is true when single video row is complete', () => {
        expect(
            multilineRowIsDownloadReady(
                baseRow({
                    metadataResolve: {
                        kind: 'single',
                        url: 'https://a.com'
                    } as MultilinePreviewRowState['metadataResolve'],
                    videoInfo: { formats: [] } as unknown as MultilinePreviewRowState['videoInfo'],
                    selectedFormatId: 'best'
                })
            )
        ).toBe(true);
    });

    it('is false for multi row until fork is resolved and batch is queued', () => {
        const multiMeta = {
            kind: 'multi',
            url: 'https://youtube.com/playlist?list=PLx',
            youtubeWatchPlaylistFork: {
                singleVideoUrl: 'https://youtube.com/watch?v=x&list=PLx'
            }
        } as MultilinePreviewRowState['metadataResolve'];
        expect(
            multilineRowIsDownloadReady(
                baseRow({
                    metadataResolve: multiMeta,
                    youtubeWatchPlaylistChoice: null,
                    multiBatchQueued: false
                })
            )
        ).toBe(false);
        expect(
            multilineRowIsDownloadReady(
                baseRow({
                    metadataResolve: multiMeta,
                    youtubeWatchPlaylistChoice: 'playlist',
                    multiBatchQueued: false
                })
            )
        ).toBe(false);
        expect(
            multilineRowIsDownloadReady(
                baseRow({
                    metadataResolve: multiMeta,
                    youtubeWatchPlaylistChoice: 'playlist',
                    multiBatchQueued: true
                })
            )
        ).toBe(true);
    });
});
