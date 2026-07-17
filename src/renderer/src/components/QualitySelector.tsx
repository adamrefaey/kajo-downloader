import clsx from 'clsx';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../../../shared/formatBytes';
import type { Format } from '../../../types';
import CustomSelect from './CustomSelect';
import styles from './QualitySelector.module.css';

interface QualitySelectorProps {
    formats: Format[];
    selectedFormatId: string;
    audioOnly: boolean;
    onChangeFormat: (formatId: string) => void;
    onToggleAudioOnly: (enabled: boolean) => void;
}

function QualitySelector({
    formats,
    selectedFormatId,
    audioOnly,
    onChangeFormat,
    onToggleAudioOnly
}: QualitySelectorProps): React.JSX.Element {
    const { t } = useTranslation('components');

    const visibleFormats = useMemo(
        () =>
            audioOnly
                ? formats.filter((format) => format.audioOnly)
                : formats.filter((format) => !format.audioOnly),
        [audioOnly, formats]
    );

    const handleToggleAudioOnly = (next: boolean): void => {
        onToggleAudioOnly(next);
        const pool = next
            ? formats.filter((format) => format.audioOnly)
            : formats.filter((format) => !format.audioOnly);
        if (!pool.some((format) => format.id === selectedFormatId) && pool.length > 0) {
            onChangeFormat(pool[0]?.id ?? '');
        }
    };

    return (
        <section className={styles.section} aria-label={t('quality.sectionAria')}>
            <label className={clsx('toggle', styles.audioOnlyToggle)}>
                <input
                    type="checkbox"
                    checked={audioOnly}
                    onChange={(event) => handleToggleAudioOnly(event.target.checked)}
                    aria-label={t('quality.audioOnlyToggleAria')}
                />
                <span className={styles.audioOnlyToggleText}>{t('quality.audioOnlyToggle')}</span>
            </label>
            <label htmlFor="quality-selector" className={styles.fieldLabel}>
                {t('quality.preferredFormatLabel')}
            </label>
            <div className={clsx(styles.qualityRow)}>
                <CustomSelect
                    id="quality-selector"
                    className={styles.formatSelect}
                    value={selectedFormatId}
                    disabled={visibleFormats.length === 0}
                    onChange={onChangeFormat}
                    placeholder={
                        visibleFormats.length ? t('quality.chooseFormat') : t('quality.fetchFirst')
                    }
                    options={visibleFormats.map((format) => ({
                        value: format.id,
                        label: formatLabel(format, t)
                    }))}
                    aria-label={t('quality.preferredFormatAria')}
                />
            </div>
        </section>
    );
}

function formatLabel(format: Format, t: (key: string) => string): string {
    const parts = [format.resolution];
    if (format.fps) {
        parts.push(`${format.fps}fps`);
    }
    if (format.filesize && format.filesize > 0) {
        parts.push(formatBytes(format.filesize));
    }
    if (format.audioOnly) {
        parts.push(t('quality.audioSuffix'));
    }
    return parts.join(' • ');
}

export default QualitySelector;
