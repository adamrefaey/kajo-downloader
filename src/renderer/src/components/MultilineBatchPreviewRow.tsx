import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { MultilinePreviewRowState } from '../app/multilinePreview.types';
import workflowStyles from './AppWorkflowPreview.module.css';
import MultilineBatchPreviewPanelStyles from './MultilineBatchPreviewPanel.module.css';
import QualitySelector from './QualitySelector';
import VideoInfoLoadingPreview from './VideoInfoLoadingPreview';
import VideoPreview from './VideoPreview';

export type MultilineBatchPreviewRowProps = {
    row: MultilinePreviewRowState;
    isStartingDownload: boolean;
    onOpenSiteAuthFromPreview: () => void;
    onRowFormatChange: (lineIndex: number, formatId: string) => void;
    onRowAudioOnly: (lineIndex: number, next: boolean) => void;
    onStartDownloadRow: (lineIndex: number) => void | Promise<void>;
    onMultilineRowOpenPlaylistPicker: (lineIndex: number) => void | Promise<void>;
    onMultilineRowOpenChannelPicker: (lineIndex: number) => void | Promise<void>;
    onMultilineYoutubeForkVideo: (lineIndex: number) => void;
    onMultilineYoutubeForkPlaylist: (lineIndex: number) => void;
    onMultilineYoutubeForkDismiss: (lineIndex: number) => void;
    onMultilineRowChannelOptionsChange: (
        lineIndex: number,
        options: Partial<{
            channelQueueVideos: boolean;
            channelQueueShorts: boolean;
            channelQueueLive: boolean;
        }>
    ) => void;
};

function rowLoadingKind(row: MultilinePreviewRowState): 'channel' | 'playlist' | 'video' {
    const m = row.metadataResolve;
    if (m?.kind === 'multi') {
        return m.youtubeBatchKind === 'channel'
            ? 'channel'
            : m.youtubeBatchKind === 'playlist'
              ? 'playlist'
              : 'video';
    }
    return 'video';
}

/**
 * Renders the body of a single multiline-batch preview row: the mutually-exclusive
 * loading / error / auth-required / single-video / playlist / channel states for one
 * pasted URL line. The owning panel keeps the list shell and the shared trim controls.
 */
export function MultilineBatchPreviewRow({
    row,
    isStartingDownload,
    onOpenSiteAuthFromPreview,
    onRowFormatChange,
    onRowAudioOnly,
    onStartDownloadRow,
    onMultilineRowOpenPlaylistPicker,
    onMultilineRowOpenChannelPicker,
    onMultilineYoutubeForkVideo,
    onMultilineYoutubeForkPlaylist,
    onMultilineYoutubeForkDismiss,
    onMultilineRowChannelOptionsChange
}: MultilineBatchPreviewRowProps): React.ReactNode {
    const { t } = useTranslation(['app', 'components']);

    if (row.resolvePending || row.fetchPending) {
        return <VideoInfoLoadingPreview kind={rowLoadingKind(row)} />;
    }
    if (row.errorMessage) {
        return <p className={MultilineBatchPreviewPanelStyles.rowError}>{row.errorMessage}</p>;
    }
    if (row.metadataResolve?.kind === 'auth-required') {
        return (
            <div className={MultilineBatchPreviewPanelStyles.rowAuth}>
                <p className={MultilineBatchPreviewPanelStyles.rowAuthText}>
                    {t('app:workflowSiteAuthRequired')}
                </p>
                <button
                    type="button"
                    className={clsx('primary-button', workflowStyles.startDownloadButton)}
                    onClick={onOpenSiteAuthFromPreview}
                >
                    {t('components:authRequiredCard.signInCta', {
                        site:
                            row.metadataResolve.siteDisplayName?.trim() ||
                            row.metadataResolve.siteDomain?.trim() ||
                            t('components:siteAuthBrowser.genericSite')
                    })}
                </button>
            </div>
        );
    }
    if (row.videoInfo) {
        if (row.multiBatchQueued) {
            return (
                <p className={MultilineBatchPreviewPanelStyles.rowQueued}>
                    {t('app:multilineRowQueuedAck')}
                </p>
            );
        }
        const rowCanStart = Boolean(row.selectedFormatId) && !isStartingDownload;
        return (
            <>
                <VideoPreview videoInfo={row.videoInfo} />
                <QualitySelector
                    formats={row.videoInfo.formats}
                    selectedFormatId={row.selectedFormatId}
                    audioOnly={row.audioOnly}
                    onChangeFormat={(id) => onRowFormatChange(row.lineIndex, id)}
                    onToggleAudioOnly={(next) => onRowAudioOnly(row.lineIndex, next)}
                />
                <div className={workflowStyles.workflowActionRow}>
                    <button
                        type="button"
                        className={clsx('primary-button', workflowStyles.startDownloadButton)}
                        disabled={!rowCanStart}
                        aria-label={
                            isStartingDownload
                                ? t('app:startingDownloadAria')
                                : t('app:startDownload')
                        }
                        title={
                            isStartingDownload ? t('app:startingDownload') : t('app:startDownload')
                        }
                        onClick={() => void onStartDownloadRow(row.lineIndex)}
                    >
                        <span>
                            {isStartingDownload
                                ? t('app:startingEllipsis')
                                : t('app:startDownloadCta')}
                        </span>
                    </button>
                </div>
            </>
        );
    }
    const meta = row.metadataResolve;
    if (meta?.kind === 'multi') {
        const fork = meta.youtubeWatchPlaylistFork;
        if (fork && row.youtubeWatchPlaylistChoice === null) {
            return (
                <div className={MultilineBatchPreviewPanelStyles.rowFork}>
                    <p className={MultilineBatchPreviewPanelStyles.rowForkIntro} dir="auto">
                        {t('components:youtubeWatchPlaylistFork.body')}
                    </p>
                    <div className={MultilineBatchPreviewPanelStyles.rowForkActions}>
                        <button
                            type="button"
                            className="ghost-button"
                            onClick={() => onMultilineYoutubeForkDismiss(row.lineIndex)}
                        >
                            {t('components:youtubeWatchPlaylistFork.cancel')}
                        </button>
                        <button
                            type="button"
                            className="primary-button"
                            onClick={() => onMultilineYoutubeForkVideo(row.lineIndex)}
                        >
                            {t('components:youtubeWatchPlaylistFork.video')}
                        </button>
                        <button
                            type="button"
                            className="primary-button"
                            onClick={() => onMultilineYoutubeForkPlaylist(row.lineIndex)}
                        >
                            {t('components:youtubeWatchPlaylistFork.playlist')}
                        </button>
                    </div>
                </div>
            );
        }
        if (row.multiBatchQueued) {
            return (
                <p className={MultilineBatchPreviewPanelStyles.rowQueued}>
                    {t('app:multilineRowQueuedAck')}
                </p>
            );
        }
        if (meta.youtubeBatchKind === 'channel') {
            const rowChannelSectionsSelected =
                row.channelQueueVideos || row.channelQueueShorts || row.channelQueueLive;
            return (
                <div className={MultilineBatchPreviewPanelStyles.rowBatch}>
                    <fieldset className={workflowStyles.channelContentOptions}>
                        <legend className={workflowStyles.channelContentOptionsLabel}>
                            {t('app:channelIncludeHeading')}
                        </legend>
                        <div className={workflowStyles.channelContentOptionsGrid}>
                            <label className={clsx('toggle', workflowStyles.channelContentOption)}>
                                <input
                                    type="checkbox"
                                    checked={row.channelQueueVideos}
                                    onChange={(e) =>
                                        onMultilineRowChannelOptionsChange(row.lineIndex, {
                                            channelQueueVideos: e.target.checked
                                        })
                                    }
                                />
                                {t('app:channelIncludeVideos')}
                            </label>
                            <label className={clsx('toggle', workflowStyles.channelContentOption)}>
                                <input
                                    type="checkbox"
                                    checked={row.channelQueueShorts}
                                    onChange={(e) =>
                                        onMultilineRowChannelOptionsChange(row.lineIndex, {
                                            channelQueueShorts: e.target.checked
                                        })
                                    }
                                />
                                {t('app:channelIncludeShorts')}
                            </label>
                            <label className={clsx('toggle', workflowStyles.channelContentOption)}>
                                <input
                                    type="checkbox"
                                    checked={row.channelQueueLive}
                                    onChange={(e) =>
                                        onMultilineRowChannelOptionsChange(row.lineIndex, {
                                            channelQueueLive: e.target.checked
                                        })
                                    }
                                />
                                {t('app:channelIncludeLive')}
                            </label>
                        </div>
                        <p className={workflowStyles.channelContentOptionsHint}>
                            {t('app:channelIncludeHint')}
                        </p>
                    </fieldset>
                    <p className={MultilineBatchPreviewPanelStyles.rowBatchHint}>
                        {t('app:workflowChannelPickerHint')}
                    </p>
                    <button
                        type="button"
                        className={clsx('primary-button', workflowStyles.startDownloadButton)}
                        disabled={!rowChannelSectionsSelected || isStartingDownload}
                        aria-label={t('app:channelBrowsePickerAria')}
                        title={t('app:channelBrowsePickerAria')}
                        onClick={() => void onMultilineRowOpenChannelPicker(row.lineIndex)}
                    >
                        <span>
                            {isStartingDownload
                                ? t('app:startingEllipsis')
                                : t('app:channelBrowsePickerCta')}
                        </span>
                    </button>
                </div>
            );
        }
        if (row.youtubeWatchPlaylistChoice === 'dismissed') {
            return null;
        }
        const playlistReady = !fork || row.youtubeWatchPlaylistChoice === 'playlist';
        if (playlistReady) {
            return (
                <div className={MultilineBatchPreviewPanelStyles.rowBatch}>
                    <p className={MultilineBatchPreviewPanelStyles.rowBatchHint}>
                        {t('app:playlistReady')}
                    </p>
                    <button
                        type="button"
                        className={clsx('primary-button', workflowStyles.startDownloadButton)}
                        disabled={isStartingDownload}
                        aria-label={t('app:addPlaylistAria')}
                        title={t('app:addPlaylistAria')}
                        onClick={() => void onMultilineRowOpenPlaylistPicker(row.lineIndex)}
                    >
                        <span>
                            {isStartingDownload
                                ? t('app:startingEllipsis')
                                : t('app:queuePlaylist')}
                        </span>
                    </button>
                </div>
            );
        }
    }
    return null;
}
