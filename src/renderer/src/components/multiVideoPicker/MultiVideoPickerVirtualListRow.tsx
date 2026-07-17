import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { normalizeSectionTrimTimestampDisplay } from '../../../../shared/sectionTrim';
import type { MediaCandidate } from '../../../../types';
import styles from '../MultiVideoPickerModal.module.css';
import { trimSectionDomIds } from './multiVideoPickerModalUtils';

/** Fields read from TanStack virtualizer rows for layout. */
export type MultiVideoPickerVirtualRowLayout = {
    key: string | number | bigint;
    index: number;
    start: number;
};

export type MultiVideoPickerVirtualListRowProps = {
    virtualRow: MultiVideoPickerVirtualRowLayout;
    entry: MediaCandidate;
    selectionKey: string;
    checked: boolean;
    trim: { start: string; end: string };
    indexLabel: string | null;
    trimExpanded: boolean;
    measureElement: (el: HTMLElement | null) => void;
    onToggleChecked: (checked: boolean) => void;
    onToggleTrimExpanded: () => void;
    onPatchTrim: (patch: Partial<{ start: string; end: string }>) => void;
};

export function MultiVideoPickerVirtualListRow({
    virtualRow,
    entry,
    selectionKey,
    checked,
    trim,
    indexLabel,
    trimExpanded,
    measureElement,
    onToggleChecked,
    onToggleTrimExpanded,
    onPatchTrim
}: MultiVideoPickerVirtualListRowProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const { panelId, toggleId } = trimSectionDomIds(selectionKey);

    return (
        // biome-ignore lint/a11y/useSemanticElements: virtual list item positioned with transform
        <div
            role="listitem"
            data-index={virtualRow.index}
            ref={measureElement}
            className={clsx(styles.row, styles.rowBody)}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
            }}
        >
            <label className={styles.rowLabel}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onToggleChecked(e.target.checked)}
                />
                {entry.thumbnailUrl ? (
                    <img className={styles.thumb} src={entry.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                    <span className={clsx(styles.thumb, styles.thumbFallback)} />
                )}
                <span className={styles.rowText}>
                    <span className={styles.rowTitleRow}>
                        {indexLabel ? (
                            <span className={styles.rowIndex} dir="ltr">
                                {indexLabel}.
                            </span>
                        ) : null}
                        <span className={styles.rowTitle} dir="auto">
                            {entry.title}
                        </span>
                    </span>
                    <span className={styles.rowMeta} dir="auto">
                        {entry.author}
                    </span>
                    {entry.channelSection ? (
                        <span className={styles.rowSection}>
                            {t(`multiVideoPicker.rowChannelSection.${entry.channelSection}`)}
                        </span>
                    ) : null}
                </span>
            </label>
            <div className={clsx(styles.rowTrimWrap, trimExpanded && styles.rowTrimWrapOpen)}>
                <button
                    type="button"
                    className={styles.rowTrimToggle}
                    id={toggleId}
                    aria-expanded={trimExpanded}
                    aria-controls={trimExpanded ? panelId : undefined}
                    onClick={onToggleTrimExpanded}
                >
                    <svg
                        className={styles.rowTrimChevron}
                        width="14"
                        height="14"
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                    >
                        <path fill="currentColor" d="M4.5 2.25 8.25 6 4.5 9.75z" />
                    </svg>
                    <span className={styles.rowTrimToggleTitle}>
                        {t('downloadItem.sectionTrimTitle')}
                    </span>
                </button>
                {trimExpanded ? (
                    <section
                        id={panelId}
                        className={styles.rowTrimFields}
                        aria-labelledby={toggleId}
                    >
                        <label className={styles.trimField}>
                            <span className={styles.trimEyebrow}>
                                {t('multiVideoPicker.trimFieldStart')}
                            </span>
                            <input
                                type="text"
                                className={clsx('input', styles.trimInput)}
                                value={trim.start}
                                onChange={(e) =>
                                    onPatchTrim({
                                        start: e.target.value.slice(0, 24)
                                    })
                                }
                                onBlur={() => {
                                    const n = normalizeSectionTrimTimestampDisplay(trim.start);
                                    if (n && n !== trim.start) {
                                        onPatchTrim({ start: n.slice(0, 24) });
                                    }
                                }}
                                placeholder="00:00:00"
                                dir="ltr"
                                aria-label={t('downloadItem.sectionTrimStart')}
                            />
                        </label>
                        <label className={styles.trimField}>
                            <span className={styles.trimEyebrow}>
                                {t('multiVideoPicker.trimFieldEnd')}
                            </span>
                            <input
                                type="text"
                                className={clsx('input', styles.trimInput)}
                                value={trim.end}
                                onChange={(e) =>
                                    onPatchTrim({
                                        end: e.target.value.slice(0, 24)
                                    })
                                }
                                onBlur={() => {
                                    const n = normalizeSectionTrimTimestampDisplay(trim.end);
                                    if (n && n !== trim.end) {
                                        onPatchTrim({ end: n.slice(0, 24) });
                                    }
                                }}
                                placeholder="00:10:00"
                                dir="ltr"
                                aria-label={t('downloadItem.sectionTrimEnd')}
                            />
                        </label>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
