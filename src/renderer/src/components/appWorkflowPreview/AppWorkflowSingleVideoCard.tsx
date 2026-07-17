import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { normalizeSectionTrimTimestampDisplay } from '../../../../shared/sectionTrim';
import type { Format, VideoInfo } from '../../../../types';
import workflowStyles from '../AppWorkflowPreview.module.css';
import downloadItemStyles from '../DownloadItem.module.css';
import QualitySelector from '../QualitySelector';
import VideoPreview from '../VideoPreview';

export type AppWorkflowSingleVideoCardProps = {
    videoInfo: VideoInfo;
    formatsForQualityUi: Format[];
    selectedFormatId: string;
    audioOnly: boolean;
    onChangeFormatId: (id: string) => void;
    onToggleAudioOnly: (next: boolean) => void;
    previewTrimExpanded: boolean;
    onTogglePreviewTrimExpanded: () => void;
    previewTrimStart: string;
    previewTrimEnd: string;
    onPreviewTrimStartChange: (value: string) => void;
    onPreviewTrimEndChange: (value: string) => void;
    canStartDownload: boolean;
    isStartingDownload: boolean;
    onStartDownload: () => void;
};

/** Single-video preview: thumbnail, quality picker, optional section-trim, and the start button. */
export function AppWorkflowSingleVideoCard({
    videoInfo,
    formatsForQualityUi,
    selectedFormatId,
    audioOnly,
    onChangeFormatId,
    onToggleAudioOnly,
    previewTrimExpanded,
    onTogglePreviewTrimExpanded,
    previewTrimStart,
    previewTrimEnd,
    onPreviewTrimStartChange,
    onPreviewTrimEndChange,
    canStartDownload,
    isStartingDownload,
    onStartDownload
}: AppWorkflowSingleVideoCardProps): React.JSX.Element {
    const { t } = useTranslation(['app', 'components']);

    return (
        <article
            className={clsx(downloadItemStyles.root, downloadItemStyles.previewItem)}
            aria-labelledby="preview-panel-heading"
        >
            <h2 id="preview-panel-heading" className="sr-only">
                {t('app:previewHeading')}
            </h2>
            <VideoPreview videoInfo={videoInfo} />
            <QualitySelector
                formats={formatsForQualityUi.length > 0 ? formatsForQualityUi : videoInfo.formats}
                selectedFormatId={selectedFormatId}
                audioOnly={audioOnly}
                onChangeFormat={onChangeFormatId}
                onToggleAudioOnly={onToggleAudioOnly}
            />
            <div
                className={clsx(
                    downloadItemStyles.previewTrimWrap,
                    previewTrimExpanded && downloadItemStyles.previewTrimWrapOpen
                )}
            >
                <button
                    type="button"
                    className={downloadItemStyles.previewTrimToggle}
                    id="single-preview-trim-toggle"
                    aria-expanded={previewTrimExpanded}
                    aria-controls={previewTrimExpanded ? 'single-preview-trim-panel' : undefined}
                    onClick={onTogglePreviewTrimExpanded}
                >
                    <svg
                        className={downloadItemStyles.previewTrimChevron}
                        width="14"
                        height="14"
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                    >
                        <path fill="currentColor" d="M4.5 2.25 8.25 6 4.5 9.75z" />
                    </svg>
                    <span className={downloadItemStyles.previewTrimToggleTitle}>
                        {t('components:downloadItem.sectionTrimTitle')}
                    </span>
                </button>
                {previewTrimExpanded ? (
                    <section
                        id="single-preview-trim-panel"
                        className={clsx(
                            downloadItemStyles.trimFields,
                            downloadItemStyles.trimFieldsRow,
                            downloadItemStyles.previewTrimFields
                        )}
                        aria-labelledby="single-preview-trim-toggle"
                    >
                        <label className={downloadItemStyles.trimField}>
                            <span className={downloadItemStyles.trimEyebrow}>
                                {t('components:downloadItem.sectionTrimStart')}
                            </span>
                            <input
                                type="text"
                                className={clsx('input', downloadItemStyles.trimInput)}
                                value={previewTrimStart}
                                onChange={(e) =>
                                    onPreviewTrimStartChange(e.target.value.slice(0, 24))
                                }
                                onBlur={() => {
                                    const n =
                                        normalizeSectionTrimTimestampDisplay(previewTrimStart);
                                    if (n && n !== previewTrimStart) {
                                        onPreviewTrimStartChange(n.slice(0, 24));
                                    }
                                }}
                                placeholder="00:00:00"
                                dir="ltr"
                                aria-label={t('components:downloadItem.sectionTrimStart')}
                            />
                        </label>
                        <label className={downloadItemStyles.trimField}>
                            <span className={downloadItemStyles.trimEyebrow}>
                                {t('components:downloadItem.sectionTrimEnd')}
                            </span>
                            <input
                                type="text"
                                className={clsx('input', downloadItemStyles.trimInput)}
                                value={previewTrimEnd}
                                onChange={(e) =>
                                    onPreviewTrimEndChange(e.target.value.slice(0, 24))
                                }
                                onBlur={() => {
                                    const n = normalizeSectionTrimTimestampDisplay(previewTrimEnd);
                                    if (n && n !== previewTrimEnd) {
                                        onPreviewTrimEndChange(n.slice(0, 24));
                                    }
                                }}
                                placeholder="00:10:00"
                                dir="ltr"
                                aria-label={t('components:downloadItem.sectionTrimEnd')}
                            />
                        </label>
                    </section>
                ) : null}
            </div>
            <div className={workflowStyles.workflowActionRow}>
                <button
                    type="button"
                    className={clsx('primary-button', workflowStyles.startDownloadButton)}
                    disabled={!canStartDownload}
                    aria-label={
                        isStartingDownload ? t('app:startingDownloadAria') : t('app:startDownload')
                    }
                    title={isStartingDownload ? t('app:startingDownload') : t('app:startDownload')}
                    onClick={onStartDownload}
                >
                    <span>
                        {isStartingDownload ? t('app:startingEllipsis') : t('app:startDownloadCta')}
                    </span>
                </button>
            </div>
        </article>
    );
}
