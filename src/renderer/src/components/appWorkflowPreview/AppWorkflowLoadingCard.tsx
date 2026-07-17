import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import workflowStyles from '../AppWorkflowPreview.module.css';
import downloadItemStyles from '../DownloadItem.module.css';
import VideoInfoLoadingPreview, {
    type VideoInfoLoadingPreviewKind
} from '../VideoInfoLoadingPreview';

export type AppWorkflowLoadingCardProps = {
    loadingPreviewKind: VideoInfoLoadingPreviewKind;
    canQuickStartDownload: boolean;
    quickStartQualityMax: number | null;
    canStartDownload: boolean;
    isStartingDownload: boolean;
    onStartDownload: () => void;
};

export function AppWorkflowLoadingCard({
    loadingPreviewKind,
    canQuickStartDownload,
    quickStartQualityMax,
    canStartDownload,
    isStartingDownload,
    onStartDownload
}: AppWorkflowLoadingCardProps): React.JSX.Element {
    const { t } = useTranslation(['app']);
    const showQuickStart = canQuickStartDownload && canStartDownload;
    const quickStartLabel =
        quickStartQualityMax !== null && quickStartQualityMax > 0
            ? t('app:quickStartDownloadCta', { quality: quickStartQualityMax })
            : t('app:quickStartDownloadCtaDefault');
    const quickStartAria =
        quickStartQualityMax !== null && quickStartQualityMax > 0
            ? t('app:quickStartDownloadAria', { quality: quickStartQualityMax })
            : t('app:quickStartDownloadAriaDefault');

    return (
        <article
            className={clsx(downloadItemStyles.root, downloadItemStyles.previewItem)}
            aria-label={t('app:loadingPreviewAria')}
        >
            <VideoInfoLoadingPreview kind={loadingPreviewKind} />
            {showQuickStart ? (
                <div className={workflowStyles.workflowActionRow}>
                    <button
                        type="button"
                        className={clsx('primary-button', workflowStyles.startDownloadButton)}
                        disabled={!canStartDownload || isStartingDownload}
                        aria-label={
                            isStartingDownload ? t('app:startingDownloadAria') : quickStartAria
                        }
                        title={isStartingDownload ? t('app:startingDownload') : quickStartLabel}
                        onClick={onStartDownload}
                    >
                        <span>
                            {isStartingDownload ? t('app:startingEllipsis') : quickStartLabel}
                        </span>
                    </button>
                </div>
            ) : null}
        </article>
    );
}
