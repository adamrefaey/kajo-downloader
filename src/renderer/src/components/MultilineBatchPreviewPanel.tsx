import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { normalizeSectionTrimTimestampDisplay } from '../../../shared/sectionTrim';
import type { MultilinePreviewRowState } from '../app/multilinePreview.types';
import downloadItemStyles from './DownloadItem.module.css';
import MultilineBatchPreviewPanelStyles from './MultilineBatchPreviewPanel.module.css';
import { MultilineBatchPreviewRow } from './MultilineBatchPreviewRow';

type MultilineBatchPreviewPanelProps = {
    rows: MultilinePreviewRowState[];
    onRowFormatChange: (lineIndex: number, formatId: string) => void;
    onRowAudioOnly: (lineIndex: number, next: boolean) => void;
    previewTrimExpanded: boolean;
    onTogglePreviewTrimExpanded: () => void;
    previewTrimStart: string;
    previewTrimEnd: string;
    onPreviewTrimStartChange: (value: string) => void;
    onPreviewTrimEndChange: (value: string) => void;
    isStartingDownload: boolean;
    onOpenSiteAuthFromPreview: () => void;
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
    onStartDownloadRow: (lineIndex: number) => void | Promise<void>;
};

export function MultilineBatchPreviewPanel({
    rows,
    onRowFormatChange,
    onRowAudioOnly,
    previewTrimExpanded,
    onTogglePreviewTrimExpanded,
    previewTrimStart,
    previewTrimEnd,
    onPreviewTrimStartChange,
    onPreviewTrimEndChange,
    isStartingDownload,
    onOpenSiteAuthFromPreview,
    onMultilineRowOpenPlaylistPicker,
    onMultilineRowOpenChannelPicker,
    onMultilineYoutubeForkVideo,
    onMultilineYoutubeForkPlaylist,
    onMultilineYoutubeForkDismiss,
    onMultilineRowChannelOptionsChange,
    onStartDownloadRow
}: MultilineBatchPreviewPanelProps): React.JSX.Element {
    const { t } = useTranslation(['app', 'components']);

    return (
        <article
            className={clsx(downloadItemStyles.root, downloadItemStyles.previewItem)}
            aria-labelledby="multiline-preview-heading"
        >
            <h2 id="multiline-preview-heading" className="sr-only">
                {t('app:multilinePreviewHeading')}
            </h2>
            <div className={MultilineBatchPreviewPanelStyles.list}>
                {rows.map((row) => (
                    <section
                        key={row.lineIndex}
                        className={MultilineBatchPreviewPanelStyles.row}
                        aria-label={t('app:multilinePreviewLine', { n: row.lineIndex + 1 })}
                    >
                        <h3 className={MultilineBatchPreviewPanelStyles.rowHeading}>
                            {t('app:multilinePreviewLine', { n: row.lineIndex + 1 })}
                        </h3>
                        <p className={MultilineBatchPreviewPanelStyles.rowUrl} dir="ltr">
                            {row.inputUrl}
                        </p>
                        <MultilineBatchPreviewRow
                            row={row}
                            isStartingDownload={isStartingDownload}
                            onOpenSiteAuthFromPreview={onOpenSiteAuthFromPreview}
                            onRowFormatChange={onRowFormatChange}
                            onRowAudioOnly={onRowAudioOnly}
                            onStartDownloadRow={onStartDownloadRow}
                            onMultilineRowOpenPlaylistPicker={onMultilineRowOpenPlaylistPicker}
                            onMultilineRowOpenChannelPicker={onMultilineRowOpenChannelPicker}
                            onMultilineYoutubeForkVideo={onMultilineYoutubeForkVideo}
                            onMultilineYoutubeForkPlaylist={onMultilineYoutubeForkPlaylist}
                            onMultilineYoutubeForkDismiss={onMultilineYoutubeForkDismiss}
                            onMultilineRowChannelOptionsChange={onMultilineRowChannelOptionsChange}
                        />
                    </section>
                ))}
            </div>
            <div
                className={clsx(
                    downloadItemStyles.previewTrimWrap,
                    previewTrimExpanded && downloadItemStyles.previewTrimWrapOpen
                )}
            >
                <button
                    type="button"
                    className={downloadItemStyles.previewTrimToggle}
                    id="multiline-preview-trim-toggle"
                    aria-expanded={previewTrimExpanded}
                    aria-controls={previewTrimExpanded ? 'multiline-preview-trim-panel' : undefined}
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
                        id="multiline-preview-trim-panel"
                        className={clsx(
                            downloadItemStyles.trimFields,
                            downloadItemStyles.trimFieldsRow,
                            downloadItemStyles.previewTrimFields
                        )}
                        aria-labelledby="multiline-preview-trim-toggle"
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
        </article>
    );
}
