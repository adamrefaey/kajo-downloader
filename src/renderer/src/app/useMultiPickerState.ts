import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useRef, useState } from 'react';
import type { YoutubeChannelFetchedSection } from '../../../shared/youtubeChannelMerge';
import type { PlaylistInfo, YoutubeChannelSectionTab } from '../../../types';

export function useMultiPickerState(): {
    multiPickerOpen: boolean;
    setMultiPickerOpen: Dispatch<SetStateAction<boolean>>;
    multiPickerPlaylist: PlaylistInfo | null;
    setMultiPickerPlaylist: Dispatch<SetStateAction<PlaylistInfo | null>>;
    multiPickerSourceUrl: string;
    setMultiPickerSourceUrl: Dispatch<SetStateAction<string>>;
    multiPickerExtractedAt: number | null;
    setMultiPickerExtractedAt: Dispatch<SetStateAction<number | null>>;
    multiPickerChannelTabs: YoutubeChannelSectionTab[] | null;
    setMultiPickerChannelTabs: Dispatch<SetStateAction<YoutubeChannelSectionTab[] | null>>;
    multiPickerChannelActiveTab: YoutubeChannelSectionTab;
    setMultiPickerChannelActiveTab: Dispatch<SetStateAction<YoutubeChannelSectionTab>>;
    multiPickerChannelBundles: Partial<
        Record<YoutubeChannelSectionTab, YoutubeChannelFetchedSection>
    >;
    setMultiPickerChannelBundles: Dispatch<
        SetStateAction<Partial<Record<YoutubeChannelSectionTab, YoutubeChannelFetchedSection>>>
    >;
    multiPickerChannelTabLoading: Partial<Record<YoutubeChannelSectionTab, boolean>>;
    setMultiPickerChannelTabLoading: Dispatch<
        SetStateAction<Partial<Record<YoutubeChannelSectionTab, boolean>>>
    >;
    multiPickerChannelTabError: Partial<Record<YoutubeChannelSectionTab, string | undefined>>;
    setMultiPickerChannelTabError: Dispatch<
        SetStateAction<Partial<Record<YoutubeChannelSectionTab, string | undefined>>>
    >;
    multiPickerPlainPlaylistStreaming: boolean;
    setMultiPickerPlainPlaylistStreaming: Dispatch<SetStateAction<boolean>>;
    multiPickerPlainPlaylistError: string | null;
    setMultiPickerPlainPlaylistError: Dispatch<SetStateAction<string | null>>;
    plainPlaylistStreamCancelRef: MutableRefObject<(() => void) | null>;
    plainPlaylistStreamGenRef: MutableRefObject<number>;
    channelTabStreamCancelRef: MutableRefObject<
        Partial<Record<YoutubeChannelSectionTab, () => void>>
    >;
    channelPickerFetchGenRef: MutableRefObject<number>;
    autoBatchPickerOpenedUrlRef: MutableRefObject<string | null>;
    resetMultiPicker: () => void;
} {
    const [multiPickerOpen, setMultiPickerOpen] = useState(false);
    const [multiPickerPlaylist, setMultiPickerPlaylist] = useState<PlaylistInfo | null>(null);
    const [multiPickerSourceUrl, setMultiPickerSourceUrl] = useState('');
    const [multiPickerExtractedAt, setMultiPickerExtractedAt] = useState<number | null>(null);
    const [multiPickerChannelTabs, setMultiPickerChannelTabs] = useState<
        YoutubeChannelSectionTab[] | null
    >(null);
    const [multiPickerChannelActiveTab, setMultiPickerChannelActiveTab] =
        useState<YoutubeChannelSectionTab>('videos');
    const [multiPickerChannelBundles, setMultiPickerChannelBundles] = useState<
        Partial<Record<YoutubeChannelSectionTab, YoutubeChannelFetchedSection>>
    >({});
    const [multiPickerChannelTabLoading, setMultiPickerChannelTabLoading] = useState<
        Partial<Record<YoutubeChannelSectionTab, boolean>>
    >({});
    const [multiPickerChannelTabError, setMultiPickerChannelTabError] = useState<
        Partial<Record<YoutubeChannelSectionTab, string | undefined>>
    >({});
    const [multiPickerPlainPlaylistStreaming, setMultiPickerPlainPlaylistStreaming] =
        useState(false);
    const [multiPickerPlainPlaylistError, setMultiPickerPlainPlaylistError] = useState<
        string | null
    >(null);
    const plainPlaylistStreamCancelRef = useRef<(() => void) | null>(null);
    const plainPlaylistStreamGenRef = useRef(0);
    const channelTabStreamCancelRef = useRef<Partial<Record<YoutubeChannelSectionTab, () => void>>>(
        {}
    );
    const channelPickerFetchGenRef = useRef(0);
    const autoBatchPickerOpenedUrlRef = useRef<string | null>(null);

    const resetMultiPicker = (): void => {
        plainPlaylistStreamCancelRef.current?.();
        plainPlaylistStreamCancelRef.current = null;
        for (const fn of Object.values(channelTabStreamCancelRef.current)) {
            fn?.();
        }
        channelTabStreamCancelRef.current = {};
        plainPlaylistStreamGenRef.current += 1;
        channelPickerFetchGenRef.current += 1;
        setMultiPickerPlainPlaylistStreaming(false);
        setMultiPickerPlainPlaylistError(null);
        setMultiPickerOpen(false);
        setMultiPickerPlaylist(null);
        setMultiPickerSourceUrl('');
        setMultiPickerExtractedAt(null);
        setMultiPickerChannelTabs(null);
        setMultiPickerChannelBundles({});
        setMultiPickerChannelTabLoading({});
        setMultiPickerChannelTabError({});
    };

    return {
        multiPickerOpen,
        setMultiPickerOpen,
        multiPickerPlaylist,
        setMultiPickerPlaylist,
        multiPickerSourceUrl,
        setMultiPickerSourceUrl,
        multiPickerExtractedAt,
        setMultiPickerExtractedAt,
        multiPickerChannelTabs,
        setMultiPickerChannelTabs,
        multiPickerChannelActiveTab,
        setMultiPickerChannelActiveTab,
        multiPickerChannelBundles,
        setMultiPickerChannelBundles,
        multiPickerChannelTabLoading,
        setMultiPickerChannelTabLoading,
        multiPickerChannelTabError,
        setMultiPickerChannelTabError,
        multiPickerPlainPlaylistStreaming,
        setMultiPickerPlainPlaylistStreaming,
        multiPickerPlainPlaylistError,
        setMultiPickerPlainPlaylistError,
        plainPlaylistStreamCancelRef,
        plainPlaylistStreamGenRef,
        channelTabStreamCancelRef,
        channelPickerFetchGenRef,
        autoBatchPickerOpenedUrlRef,
        resetMultiPicker
    };
}

export type MultiPickerState = ReturnType<typeof useMultiPickerState>;
