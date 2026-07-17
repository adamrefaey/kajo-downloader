import type { MediaCandidate, YoutubeChannelSectionTab } from '../../../../types';

export type MultiVideoPickerChannelTabsConfig = {
    tabs: YoutubeChannelSectionTab[];
    activeTab: YoutubeChannelSectionTab;
    onTabChange: (tab: YoutubeChannelSectionTab) => void;
    tabEntries: Partial<Record<YoutubeChannelSectionTab, MediaCandidate[]>>;
    tabLoading: Partial<Record<YoutubeChannelSectionTab, boolean>>;
    tabError: Partial<Record<YoutubeChannelSectionTab, string | undefined>>;
};

export type MultiVideoPickerSelection = {
    entry: MediaCandidate;
    sectionTrim?: { start: string; end: string } | undefined;
    /** 1-based position of this entry in the full (unfiltered) playlist/channel-tab list. */
    originalOrdinal?: number | undefined;
};

export type MultiVideoPickerModalProps = {
    open: boolean;
    onClose: () => void;
    collectionTitle: string;
    entries: MediaCandidate[];
    numberPlaylistItems: boolean;
    onNumberPlaylistItemsChange: (next: boolean) => void;
    onConfirm: (selected: MultiVideoPickerSelection[]) => void;
    /** YouTube channel batch: one async-loaded tab at a time; list keys are prefixed by tab. */
    channelTabs?: MultiVideoPickerChannelTabsConfig | null;
    /** Non-channel playlist: flat list is still streaming from main. */
    plainPlaylistStreaming?: boolean;
    plainPlaylistError?: string | null;
};
