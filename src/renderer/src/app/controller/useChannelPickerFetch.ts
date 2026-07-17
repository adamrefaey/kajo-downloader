import type { TFunction } from 'i18next';
import { useEffect } from 'react';
import {
    buildYoutubeChannelContentLookupUrls,
    getYoutubeChannelBaseUrl
} from '../../../../shared/youtubeChannelContentUrls';
import { mergeYoutubeChannelSectionsForPlaylistInfo } from '../../../../shared/youtubeChannelMerge';
import { resolveYoutubeFlatPlaylistLookupUrl } from '../../../../shared/youtubeFlatPlaylistUrl';
import type {
    MediaCandidate,
    MetadataResolveResult,
    PlaylistInfo,
    YoutubeChannelSectionTab
} from '../../../../types';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';
import type { MultiPickerState } from '../useMultiPickerState';

/**
 * Batch picker subtitle: first non-empty values win; later stream/meta must not replace them.
 */
export function stickyPlaylistPickerHeader(
    prev: PlaylistInfo,
    patch: { title?: string | undefined; channel?: string | undefined; id?: string | undefined },
    titleIfStillEmpty: string
): PlaylistInfo {
    const title = prev.title?.trim() ? prev.title : patch.title?.trim() || titleIfStillEmpty;
    const channel = prev.channel?.trim() ? prev.channel : patch.channel?.trim() || prev.channel;
    const id = prev.id?.trim() ? prev.id : patch.id?.trim() || prev.id;
    if (title === prev.title && channel === prev.channel && id === prev.id) {
        return prev;
    }
    return { ...prev, title, channel, id };
}

/**
 * Explicit overrides for `openChannelMultiPicker` used by the multiline row picker to bypass
 * stale closure values after a `flushSync` re-render.
 */
export interface ChannelPickerOverrides {
    metadataResolve: MetadataResolveResult | null;
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
}

export function useChannelPickerFetch(options: {
    t: TFunction;
    trimmedUrl: string;
    metadataResolve: MetadataResolveResult | null;
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
    primaryWorkflowUrl: string;
    multiPicker: MultiPickerState;
}): {
    openChannelMultiPicker: (overrides?: ChannelPickerOverrides) => Promise<boolean>;
    multiPickerChannelTabEntries: Partial<Record<YoutubeChannelSectionTab, MediaCandidate[]>>;
} {
    const {
        t,
        trimmedUrl,
        metadataResolve,
        channelQueueVideos,
        channelQueueShorts,
        channelQueueLive,
        primaryWorkflowUrl,
        multiPicker
    } = options;

    const {
        multiPickerOpen,
        multiPickerPlaylist,
        multiPickerSourceUrl,
        multiPickerChannelTabs,
        multiPickerChannelBundles,
        multiPickerChannelTabLoading,
        setMultiPickerOpen,
        setMultiPickerPlaylist,
        setMultiPickerSourceUrl,
        setMultiPickerExtractedAt,
        setMultiPickerChannelTabs,
        setMultiPickerChannelActiveTab,
        setMultiPickerChannelBundles,
        setMultiPickerChannelTabLoading,
        setMultiPickerChannelTabError,
        channelPickerFetchGenRef,
        channelTabStreamCancelRef,
        autoBatchPickerOpenedUrlRef
    } = multiPicker;

    const openChannelMultiPicker = async (overrides?: ChannelPickerOverrides): Promise<boolean> => {
        // When called from the multiline row picker, the outer function's closure is stale
        // after flushSync. Explicit overrides carry the correct row-level values.
        const effectiveMeta = overrides?.metadataResolve ?? metadataResolve;
        const effectiveChannelQueueVideos = overrides?.channelQueueVideos ?? channelQueueVideos;
        const effectiveChannelQueueShorts = overrides?.channelQueueShorts ?? channelQueueShorts;
        const effectiveChannelQueueLive = overrides?.channelQueueLive ?? channelQueueLive;

        const channelSourceUrl =
            effectiveMeta?.kind === 'multi' ? effectiveMeta.url.trim() : primaryWorkflowUrl;

        const base = getYoutubeChannelBaseUrl(channelSourceUrl);
        if (!base) {
            throw new Error(t('errors:channelUrlUnrecognized'));
        }
        const tabs: YoutubeChannelSectionTab[] = [];
        if (effectiveChannelQueueVideos) {
            tabs.push('videos');
        }
        if (effectiveChannelQueueShorts) {
            tabs.push('shorts');
        }
        if (effectiveChannelQueueLive) {
            tabs.push('live');
        }
        if (tabs.length === 0) {
            throw new Error(t('errors:channelSectionsEmpty'));
        }
        const firstTab = tabs[0];
        if (!firstTab) {
            throw new Error(t('errors:channelSectionsEmpty'));
        }

        const initialTitle =
            effectiveMeta?.kind === 'multi' &&
            effectiveMeta.youtubePrefetchedUploadsPlaylist?.channel?.trim()
                ? effectiveMeta.youtubePrefetchedUploadsPlaylist.channel.trim()
                : effectiveMeta?.kind === 'multi' && effectiveMeta.candidates?.[0]?.author?.trim()
                  ? effectiveMeta.candidates[0].author.trim()
                  : t('app:channelBatchFallbackTitle');

        channelPickerFetchGenRef.current += 1;
        setMultiPickerChannelTabs(tabs);
        setMultiPickerChannelActiveTab(firstTab);
        setMultiPickerChannelBundles({});
        setMultiPickerChannelTabLoading({});
        setMultiPickerChannelTabError({});

        const initialChannel =
            effectiveMeta?.kind === 'multi' &&
            effectiveMeta.youtubePrefetchedUploadsPlaylist?.channel
                ? effectiveMeta.youtubePrefetchedUploadsPlaylist.channel
                : undefined;

        setMultiPickerPlaylist({
            title: initialTitle,
            entries: [],
            sourceUrl: channelSourceUrl,
            collectionKind: 'channel',
            channel: initialChannel
        });
        setMultiPickerSourceUrl(channelSourceUrl);
        setMultiPickerExtractedAt(Date.now());
        autoBatchPickerOpenedUrlRef.current = trimmedUrl;
        setMultiPickerOpen(true);
        return true;
    };

    let multiPickerChannelTabEntries: Partial<Record<YoutubeChannelSectionTab, MediaCandidate[]>> =
        {};
    if (multiPickerChannelTabs?.length) {
        const title = multiPickerPlaylist?.title?.trim() || t('app:channelBatchFallbackTitle');
        const channelPage = multiPickerSourceUrl.trim() || primaryWorkflowUrl;
        const out: Partial<Record<YoutubeChannelSectionTab, MediaCandidate[]>> = {};
        for (const tab of multiPickerChannelTabs) {
            const b = multiPickerChannelBundles[tab];
            if (!b) {
                out[tab] = [];
                continue;
            }
            out[tab] = mergeYoutubeChannelSectionsForPlaylistInfo(
                [{ lookupUrl: b.lookupUrl, info: b.info }],
                { channelPageUrl: channelPage, title }
            ).entries;
        }
        multiPickerChannelTabEntries = out;
    }

    useEffect(() => {
        if (!window.api || !multiPickerOpen || !multiPickerChannelTabs?.length) {
            return;
        }
        const tabsToFetch = multiPickerChannelTabs.filter(
            (tab) => !multiPickerChannelBundles[tab] && !multiPickerChannelTabLoading[tab]
        );
        if (tabsToFetch.length === 0) {
            return;
        }
        const gen = channelPickerFetchGenRef.current;
        /** Only this tab may update picker `title` / `channel`; shorts/live run in parallel and may race the header. */
        const primaryChannelTab = multiPickerChannelTabs[0];

        const uploadsPrefetch =
            metadataResolve?.kind === 'multi'
                ? metadataResolve.youtubePrefetchedUploadsPlaylist
                : undefined;
        const channelTabSourceUrl = multiPickerSourceUrl.trim() || primaryWorkflowUrl;
        const uploadsLookupUrl = resolveYoutubeFlatPlaylistLookupUrl(channelTabSourceUrl);

        for (const tab of tabsToFetch) {
            void (async () => {
                setMultiPickerChannelTabLoading((p) => ({ ...p, [tab]: true }));
                setMultiPickerChannelTabError((p) => ({ ...p, [tab]: undefined }));
                let clearLoadingInFinally = true;
                try {
                    const base = getYoutubeChannelBaseUrl(channelTabSourceUrl);
                    if (!base) {
                        throw new Error(t('errors:channelUrlUnrecognized'));
                    }
                    const urls = buildYoutubeChannelContentLookupUrls(base, {
                        videos: tab === 'videos',
                        shorts: tab === 'shorts',
                        live: tab === 'live'
                    });
                    const playlistUrl = urls[0];
                    if (!playlistUrl) {
                        throw new Error(t('errors:channelSectionsEmpty'));
                    }

                    if (
                        tab === 'videos' &&
                        uploadsPrefetch &&
                        uploadsPrefetch.entries.length > 0 &&
                        playlistUrl === uploadsLookupUrl
                    ) {
                        const data = uploadsPrefetch;
                        if (gen !== channelPickerFetchGenRef.current) {
                            return;
                        }
                        setMultiPickerChannelBundles((p) => ({
                            ...p,
                            [tab]: { lookupUrl: playlistUrl, info: data }
                        }));
                        if (tab === primaryChannelTab) {
                            setMultiPickerPlaylist((prev) => {
                                if (!prev) {
                                    return prev;
                                }
                                return stickyPlaylistPickerHeader(
                                    prev,
                                    {
                                        title: data.channel?.trim() || data.title?.trim(),
                                        channel: data.channel?.trim()
                                    },
                                    t('app:channelBatchFallbackTitle')
                                );
                            });
                        }
                    } else {
                        clearLoadingInFinally = false;
                        let accumulated: MediaCandidate[] = [];
                        let streamTitle = '';
                        let streamChannel: string | undefined;
                        let streamPlaylistId: string | undefined;

                        const applyBundle = () => {
                            if (gen !== channelPickerFetchGenRef.current) {
                                return;
                            }
                            setMultiPickerChannelBundles((p) => ({
                                ...p,
                                [tab]: {
                                    lookupUrl: playlistUrl,
                                    info: {
                                        title: streamTitle || t('app:channelBatchFallbackTitle'),
                                        channel: streamChannel,
                                        id: streamPlaylistId,
                                        entries: accumulated,
                                        sourceUrl: primaryWorkflowUrl,
                                        collectionKind: 'channel'
                                    }
                                }
                            }));
                            if (tab === primaryChannelTab) {
                                setMultiPickerPlaylist((prev) => {
                                    if (!prev) {
                                        return prev;
                                    }
                                    return stickyPlaylistPickerHeader(
                                        prev,
                                        {
                                            title: streamChannel?.trim() || streamTitle?.trim(),
                                            channel: streamChannel?.trim(),
                                            id: streamPlaylistId?.trim()
                                        },
                                        t('app:channelBatchFallbackTitle')
                                    );
                                });
                            }
                        };

                        const cancel = await window.api.fetchPlaylistInfoStream(
                            playlistUrl,
                            (evt) => {
                                if (gen !== channelPickerFetchGenRef.current) {
                                    return;
                                }
                                if (evt.kind === 'meta') {
                                    if (evt.title?.trim()) {
                                        streamTitle = evt.title.trim();
                                    }
                                    if (evt.channel?.trim()) {
                                        streamChannel = evt.channel.trim();
                                    }
                                    if (evt.id?.trim()) {
                                        streamPlaylistId = evt.id.trim();
                                    }
                                    applyBundle();
                                }
                                if (evt.kind === 'entries' && evt.entries.length) {
                                    accumulated = accumulated.concat(evt.entries);
                                    applyBundle();
                                }
                                if (evt.kind === 'error') {
                                    delete channelTabStreamCancelRef.current[tab];
                                    if (gen === channelPickerFetchGenRef.current) {
                                        setMultiPickerChannelTabLoading((p) => ({
                                            ...p,
                                            [tab]: false
                                        }));
                                    }
                                    setMultiPickerChannelTabError((p) => ({
                                        ...p,
                                        [tab]: evt.message
                                    }));
                                }
                                if (evt.kind === 'done') {
                                    delete channelTabStreamCancelRef.current[tab];
                                    if (accumulated.length === 0) {
                                        setMultiPickerChannelTabError((p) => {
                                            if (p[tab]?.trim()) {
                                                return p;
                                            }
                                            return { ...p, [tab]: t('errors:playlistEmpty') };
                                        });
                                    }
                                    if (gen === channelPickerFetchGenRef.current) {
                                        setMultiPickerChannelTabLoading((p) => ({
                                            ...p,
                                            [tab]: false
                                        }));
                                    }
                                }
                            }
                        );
                        channelTabStreamCancelRef.current[tab] = cancel;

                        if (gen !== channelPickerFetchGenRef.current) {
                            cancel();
                            return;
                        }
                    }
                } catch (cause) {
                    if (gen !== channelPickerFetchGenRef.current) {
                        return;
                    }
                    setMultiPickerChannelTabError((p) => ({
                        ...p,
                        [tab]: getErrorMessage(cause, t('errors:metadataPlaylistFailed'))
                    }));
                } finally {
                    if (clearLoadingInFinally && gen === channelPickerFetchGenRef.current) {
                        setMultiPickerChannelTabLoading((p) => ({ ...p, [tab]: false }));
                    }
                }
            })();
        }
    }, [
        channelPickerFetchGenRef,
        channelTabStreamCancelRef,
        metadataResolve,
        multiPickerChannelBundles,
        multiPickerChannelTabLoading,
        multiPickerChannelTabs,
        multiPickerOpen,
        setMultiPickerChannelBundles,
        setMultiPickerChannelTabError,
        setMultiPickerChannelTabLoading,
        setMultiPickerPlaylist,
        t,
        multiPickerSourceUrl,
        primaryWorkflowUrl
    ]);

    return { openChannelMultiPicker, multiPickerChannelTabEntries };
}
