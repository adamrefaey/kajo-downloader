import { type SetStateAction, useMemo, useState } from 'react';
import type { MetadataResolveResult, VideoInfo } from '../../../../types';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import type { ModalState } from '../useModalState';
import { useModalState } from '../useModalState';
import { useMultiPickerState } from '../useMultiPickerState';

/** User choice for YouTube watch+`list=` URLs; `null` means not chosen yet (show fork modal when applicable). */
export type YoutubeWatchPlaylistChoice = null | 'video' | 'playlist' | 'dismissed';

function apply<T>(prev: T, next: SetStateAction<T>): T {
    return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

/** Avoid `{ ...s, field }` when `field` is unchanged — prevents effect-driven render loops. */
function patchStateField<S, K extends keyof S>(
    setState: (value: SetStateAction<S>) => void,
    key: K
): (value: SetStateAction<S[K]>) => void {
    return (value) => {
        setState((prev) => {
            const next = apply(prev[key], value);
            return Object.is(next, prev[key]) ? prev : { ...prev, [key]: next };
        });
    };
}

export function useAppControllerLocalState(): {
    url: string;
    setUrl: (v: SetStateAction<string>) => void;
    videoInfo: VideoInfo | null;
    setVideoInfo: (v: SetStateAction<VideoInfo | null>) => void;
    selectedFormatId: string;
    setSelectedFormatId: (v: SetStateAction<string>) => void;
    audioOnly: boolean;
    setAudioOnly: (v: SetStateAction<boolean>) => void;
    previewTrimStart: string;
    setPreviewTrimStart: (v: SetStateAction<string>) => void;
    previewTrimEnd: string;
    setPreviewTrimEnd: (v: SetStateAction<string>) => void;
    previewTrimExpanded: boolean;
    setPreviewTrimExpanded: (v: SetStateAction<boolean>) => void;
    numberPlaylistItems: boolean;
    setNumberPlaylistItems: (v: SetStateAction<boolean>) => void;
    channelQueueVideos: boolean;
    setChannelQueueVideos: (v: SetStateAction<boolean>) => void;
    channelQueueShorts: boolean;
    setChannelQueueShorts: (v: SetStateAction<boolean>) => void;
    channelQueueLive: boolean;
    setChannelQueueLive: (v: SetStateAction<boolean>) => void;
    clipboardHint: string | null;
    setClipboardHint: (v: SetStateAction<string | null>) => void;
    metadataResolve: MetadataResolveResult | null;
    setMetadataResolve: (v: SetStateAction<MetadataResolveResult | null>) => void;
    metadataResolvePending: boolean;
    setMetadataResolvePending: (v: SetStateAction<boolean>) => void;
    isFetchingInfo: boolean;
    setIsFetchingInfo: (v: SetStateAction<boolean>) => void;
    isStartingDownload: boolean;
    setIsStartingDownload: (v: SetStateAction<boolean>) => void;
    isYoutubeLibraryQueueing: boolean;
    setIsYoutubeLibraryQueueing: (v: SetStateAction<boolean>) => void;
    error: string | null;
    setError: (v: SetStateAction<string | null>) => void;
    modal: ModalState;
    multiPicker: ReturnType<typeof useMultiPickerState>;
    metadataResolveRefreshKey: number;
    setMetadataResolveRefreshKey: (v: SetStateAction<number>) => void;
    youtubeWatchPlaylistChoice: YoutubeWatchPlaylistChoice;
    setYoutubeWatchPlaylistChoice: (v: SetStateAction<YoutubeWatchPlaylistChoice>) => void;
    multilinePreviewRows: MultilinePreviewRowState[];
    setMultilinePreviewRows: (v: SetStateAction<MultilinePreviewRowState[]>) => void;
} {
    const modal = useModalState();
    const multiPicker = useMultiPickerState();

    const [input, setInput] = useState({
        url: '',
        audioOnly: false,
        previewTrimStart: '',
        previewTrimEnd: '',
        previewTrimExpanded: false
    });

    const [channelPlaylist, setChannelPlaylist] = useState({
        numberPlaylistItems: true,
        channelQueueVideos: true,
        channelQueueShorts: false,
        channelQueueLive: false
    });

    const [loading, setLoading] = useState({
        isFetchingInfo: false,
        isStartingDownload: false,
        isYoutubeLibraryQueueing: false,
        metadataResolvePending: false
    });

    const [media, setMedia] = useState({
        videoInfo: null as VideoInfo | null,
        metadataResolve: null as MetadataResolveResult | null,
        selectedFormatId: ''
    });

    const [ui, setUi] = useState({
        clipboardHint: null as string | null,
        error: null as string | null,
        metadataResolveRefreshKey: 0,
        youtubeWatchPlaylistChoice: null as YoutubeWatchPlaylistChoice,
        multilinePreviewRows: [] as MultilinePreviewRowState[]
    });

    const setUrl = useMemo(() => patchStateField(setInput, 'url'), [setInput]);
    const setVideoInfo = useMemo(() => patchStateField(setMedia, 'videoInfo'), [setMedia]);
    const setSelectedFormatId = useMemo(
        () => patchStateField(setMedia, 'selectedFormatId'),
        [setMedia]
    );
    const setAudioOnly = useMemo(() => patchStateField(setInput, 'audioOnly'), [setInput]);
    const setPreviewTrimStart = useMemo(
        () => patchStateField(setInput, 'previewTrimStart'),
        [setInput]
    );
    const setPreviewTrimEnd = useMemo(
        () => patchStateField(setInput, 'previewTrimEnd'),
        [setInput]
    );
    const setPreviewTrimExpanded = useMemo(
        () => patchStateField(setInput, 'previewTrimExpanded'),
        [setInput]
    );
    const setNumberPlaylistItems = useMemo(
        () => patchStateField(setChannelPlaylist, 'numberPlaylistItems'),
        [setChannelPlaylist]
    );
    const setChannelQueueVideos = useMemo(
        () => patchStateField(setChannelPlaylist, 'channelQueueVideos'),
        [setChannelPlaylist]
    );
    const setChannelQueueShorts = useMemo(
        () => patchStateField(setChannelPlaylist, 'channelQueueShorts'),
        [setChannelPlaylist]
    );
    const setChannelQueueLive = useMemo(
        () => patchStateField(setChannelPlaylist, 'channelQueueLive'),
        [setChannelPlaylist]
    );
    const setClipboardHint = useMemo(() => patchStateField(setUi, 'clipboardHint'), [setUi]);
    const setMetadataResolve = useMemo(
        () => patchStateField(setMedia, 'metadataResolve'),
        [setMedia]
    );
    const setMetadataResolvePending = useMemo(
        () => patchStateField(setLoading, 'metadataResolvePending'),
        [setLoading]
    );
    const setIsFetchingInfo = useMemo(
        () => patchStateField(setLoading, 'isFetchingInfo'),
        [setLoading]
    );
    const setIsStartingDownload = useMemo(
        () => patchStateField(setLoading, 'isStartingDownload'),
        [setLoading]
    );
    const setIsYoutubeLibraryQueueing = useMemo(
        () => patchStateField(setLoading, 'isYoutubeLibraryQueueing'),
        [setLoading]
    );
    const setError = useMemo(() => patchStateField(setUi, 'error'), [setUi]);
    const setMetadataResolveRefreshKey = useMemo(
        () => patchStateField(setUi, 'metadataResolveRefreshKey'),
        [setUi]
    );
    const setYoutubeWatchPlaylistChoice = useMemo(
        () => patchStateField(setUi, 'youtubeWatchPlaylistChoice'),
        [setUi]
    );
    const setMultilinePreviewRows = useMemo(
        () => patchStateField(setUi, 'multilinePreviewRows'),
        [setUi]
    );

    return {
        url: input.url,
        setUrl,
        videoInfo: media.videoInfo,
        setVideoInfo,
        selectedFormatId: media.selectedFormatId,
        setSelectedFormatId,
        audioOnly: input.audioOnly,
        setAudioOnly,
        previewTrimStart: input.previewTrimStart,
        setPreviewTrimStart,
        previewTrimEnd: input.previewTrimEnd,
        setPreviewTrimEnd,
        previewTrimExpanded: input.previewTrimExpanded,
        setPreviewTrimExpanded,
        numberPlaylistItems: channelPlaylist.numberPlaylistItems,
        setNumberPlaylistItems,
        channelQueueVideos: channelPlaylist.channelQueueVideos,
        setChannelQueueVideos,
        channelQueueShorts: channelPlaylist.channelQueueShorts,
        setChannelQueueShorts,
        channelQueueLive: channelPlaylist.channelQueueLive,
        setChannelQueueLive,
        clipboardHint: ui.clipboardHint,
        setClipboardHint,
        metadataResolve: media.metadataResolve,
        setMetadataResolve,
        metadataResolvePending: loading.metadataResolvePending,
        setMetadataResolvePending,
        isFetchingInfo: loading.isFetchingInfo,
        setIsFetchingInfo,
        isStartingDownload: loading.isStartingDownload,
        setIsStartingDownload,
        isYoutubeLibraryQueueing: loading.isYoutubeLibraryQueueing,
        setIsYoutubeLibraryQueueing,
        error: ui.error,
        setError,
        modal,
        multiPicker,
        metadataResolveRefreshKey: ui.metadataResolveRefreshKey,
        setMetadataResolveRefreshKey,
        youtubeWatchPlaylistChoice: ui.youtubeWatchPlaylistChoice,
        setYoutubeWatchPlaylistChoice,
        multilinePreviewRows: ui.multilinePreviewRows,
        setMultilinePreviewRows
    };
}
