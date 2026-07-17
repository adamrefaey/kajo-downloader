import type { MetadataResolveResult, VideoInfo } from '../../../types';

/** Per-row choice for YouTube watch+`list=` links (mirrors global fork modal). */
export type MultilineYoutubeForkChoice = null | 'video' | 'playlist' | 'dismissed';

/** One line in a multiline URL batch: resolve + optional video preview. */
export type MultilinePreviewRowState = {
    lineIndex: number;
    inputUrl: string;
    resolvePending: boolean;
    fetchPending: boolean;
    metadataResolve: MetadataResolveResult | null;
    videoInfo: VideoInfo | null;
    errorMessage: string | null;
    selectedFormatId: string;
    audioOnly: boolean;
    /** Playlist/channel line: user finished multi-picker and items were queued. Also used for single-video rows that were individually started. */
    multiBatchQueued: boolean;
    youtubeWatchPlaylistChoice: MultilineYoutubeForkChoice;
    /** Per-row channel content type selection (only relevant when metadataResolve.kind === 'multi' && youtubeBatchKind === 'channel'). */
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
};

export function multilineRowIsDownloadReady(row: MultilinePreviewRowState): boolean {
    if (row.resolvePending || row.fetchPending || row.errorMessage) {
        return false;
    }
    if (row.metadataResolve?.kind === 'single') {
        return row.videoInfo !== null && row.selectedFormatId.length > 0;
    }
    if (row.metadataResolve?.kind === 'multi') {
        const fork = row.metadataResolve.youtubeWatchPlaylistFork;
        if (fork && row.youtubeWatchPlaylistChoice === null) {
            return false;
        }
        if (fork && row.youtubeWatchPlaylistChoice === 'dismissed') {
            return false;
        }
        return row.multiBatchQueued;
    }
    return false;
}
