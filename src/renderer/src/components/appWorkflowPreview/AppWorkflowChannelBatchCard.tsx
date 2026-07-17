import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import workflowStyles from '../AppWorkflowPreview.module.css';
import downloadItemStyles from '../DownloadItem.module.css';

export type AppWorkflowChannelBatchCardProps = {
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
    onChannelQueueVideosChange: (checked: boolean) => void;
    onChannelQueueShortsChange: (checked: boolean) => void;
    onChannelQueueLiveChange: (checked: boolean) => void;
    canStartBatchDownload: boolean;
    isStartingDownload: boolean;
    onChannelBatchBrowse: () => void;
};

/** YouTube channel batch: content-type toggles (videos/shorts/live) and a browse-picker button. */
export function AppWorkflowChannelBatchCard({
    channelQueueVideos,
    channelQueueShorts,
    channelQueueLive,
    onChannelQueueVideosChange,
    onChannelQueueShortsChange,
    onChannelQueueLiveChange,
    canStartBatchDownload,
    isStartingDownload,
    onChannelBatchBrowse
}: AppWorkflowChannelBatchCardProps): React.JSX.Element {
    const { t } = useTranslation(['app']);

    return (
        <article
            className={clsx(downloadItemStyles.root, downloadItemStyles.previewItem)}
            aria-labelledby="channel-batch-heading"
        >
            <h2 id="channel-batch-heading" className="sr-only">
                {t('app:channelOptionsHeading')}
            </h2>
            <fieldset className={workflowStyles.channelContentOptions}>
                <legend className={workflowStyles.channelContentOptionsLabel}>
                    {t('app:channelIncludeHeading')}
                </legend>
                <div className={workflowStyles.channelContentOptionsGrid}>
                    <label className={clsx('toggle', workflowStyles.channelContentOption)}>
                        <input
                            type="checkbox"
                            checked={channelQueueVideos}
                            onChange={(event) => onChannelQueueVideosChange(event.target.checked)}
                        />
                        {t('app:channelIncludeVideos')}
                    </label>
                    <label className={clsx('toggle', workflowStyles.channelContentOption)}>
                        <input
                            type="checkbox"
                            checked={channelQueueShorts}
                            onChange={(event) => onChannelQueueShortsChange(event.target.checked)}
                        />
                        {t('app:channelIncludeShorts')}
                    </label>
                    <label className={clsx('toggle', workflowStyles.channelContentOption)}>
                        <input
                            type="checkbox"
                            checked={channelQueueLive}
                            onChange={(event) => onChannelQueueLiveChange(event.target.checked)}
                        />
                        {t('app:channelIncludeLive')}
                    </label>
                </div>
                <p className={workflowStyles.channelContentOptionsHint}>
                    {t('app:channelIncludeHint')}
                </p>
            </fieldset>
            <div className={workflowStyles.workflowActionRow}>
                <button
                    type="button"
                    className={clsx('primary-button', workflowStyles.startDownloadButton)}
                    disabled={!canStartBatchDownload || isStartingDownload}
                    aria-label={t('app:channelBrowsePickerAria')}
                    title={t('app:channelBrowsePickerAria')}
                    onClick={onChannelBatchBrowse}
                >
                    <span>
                        {isStartingDownload
                            ? t('app:startingEllipsis')
                            : t('app:channelBrowsePickerCta')}
                    </span>
                </button>
            </div>
        </article>
    );
}
