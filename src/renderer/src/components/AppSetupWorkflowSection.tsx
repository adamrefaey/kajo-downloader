import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useSetupStore } from '../../../store/setupStore';
import styles from './AppSetupWorkflowSection.module.css';
import InlineError from './feedback/InlineError';
import StatusBanner from './feedback/StatusBanner';
import { ToolbarIcon } from './ToolbarIcon';

export type AppSetupWorkflowSectionProps = {
    error: string | null;
    onInstallYtdlp: () => void;
};

export function AppSetupWorkflowSection({
    error,
    onInstallYtdlp
}: AppSetupWorkflowSectionProps): React.JSX.Element {
    const { t } = useTranslation(['app', 'errors']);
    const setupStatus = useSetupStore((s) => s.setupStatus);
    const isInstallingYtdlp = useSetupStore((s) => s.isInstallingYtdlp);
    const setupLogs = useSetupStore((s) => s.setupLogs);

    return (
        <section id="workflow-region" className="panel" aria-labelledby="setup-required-heading">
            <div className={styles.sectionHead}>
                <h2 id="setup-required-heading">{t('app:setupRequired')}</h2>
            </div>

            <StatusBanner
                tone="warning"
                title={t('app:dependenciesMissing')}
                message={
                    setupStatus?.ytdlpInstalled && !setupStatus.ffmpegInstalled
                        ? t('app:setupFfmpegOnly')
                        : !setupStatus?.ytdlpInstalled && setupStatus?.ffmpegInstalled
                          ? t('app:setupYtdlpOnly')
                          : t('app:setupBothMissing')
                }
            />
            <p className={styles.setupTrustNote} role="note">
                {t('app:setupTrustNote')}
            </p>

            <ul className={styles.setupChecklist} aria-label={t('app:setupChecklistAria')}>
                <li
                    className={clsx(
                        styles.setupCheckRow,
                        setupStatus?.homebrewInstalled
                            ? styles.setupCheckOk
                            : styles.setupCheckMissing
                    )}
                >
                    <span className={styles.setupCheckDot} aria-hidden="true" />
                    <span>
                        {setupStatus?.homebrewInstalled
                            ? t('app:homebrewAvailable')
                            : t('app:homebrewMissing')}
                    </span>
                </li>
                <li
                    className={clsx(
                        styles.setupCheckRow,
                        setupStatus?.ytdlpInstalled ? styles.setupCheckOk : styles.setupCheckMissing
                    )}
                >
                    <span className={styles.setupCheckDot} aria-hidden="true" />
                    <span>
                        {setupStatus?.ytdlpInstalled
                            ? t('app:ytdlpInstalled')
                            : t('app:ytdlpNotInstalled')}
                    </span>
                </li>
                <li
                    className={clsx(
                        styles.setupCheckRow,
                        setupStatus?.ffmpegInstalled
                            ? styles.setupCheckOk
                            : styles.setupCheckMissing
                    )}
                >
                    <span className={styles.setupCheckDot} aria-hidden="true" />
                    <span>
                        {setupStatus?.ffmpegInstalled
                            ? t('app:ffmpegInstalled')
                            : t('app:ffmpegNotInstalled')}
                    </span>
                </li>
            </ul>

            <button
                type="button"
                className="primary-button icon-button"
                disabled={isInstallingYtdlp}
                aria-label={
                    isInstallingYtdlp ? t('app:installingDepsAria') : t('app:installDepsAria')
                }
                title={isInstallingYtdlp ? t('app:installingDepsTitle') : t('app:installDepsTitle')}
                onClick={onInstallYtdlp}
            >
                <ToolbarIcon name={isInstallingYtdlp ? 'loading' : 'install'} />
            </button>
            {error ? <InlineError message={error} /> : null}
            {setupLogs.length > 0 ? (
                <pre
                    className={clsx('panel', 'panel-inset', styles.setupLog)}
                    role="log"
                    aria-live="polite"
                >
                    {setupLogs.join('\n')}
                </pre>
            ) : null}
        </section>
    );
}
