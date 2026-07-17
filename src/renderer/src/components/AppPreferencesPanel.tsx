import appIconUrl from '@resources/icon.png?url';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import appShellStyles from './layout/AppShell.module.css';

export type AppPreferencesPanelProps = {
    visible: boolean;
    onOpenSiteSessions: () => void;
    onOpenHistory: () => void;
    onOpenSettings: () => void;
};

export function AppPreferencesPanel({
    visible,
    onOpenSiteSessions,
    onOpenHistory,
    onOpenSettings
}: AppPreferencesPanelProps): React.JSX.Element | null {
    const { t } = useTranslation(['app', 'common']);

    if (!visible) {
        return null;
    }

    return (
        <section
            className={appShellStyles.preferencesPanel}
            aria-label={t('app:preferencesHeaderAria')}
        >
            <div className={appShellStyles.preferencesHeader}>
                <div className={appShellStyles.preferencesBrand}>
                    <span className={appShellStyles.preferencesBrandIcon} aria-hidden="true">
                        <img src={appIconUrl} alt="" width={32} height={32} decoding="async" />
                    </span>
                    <h2 className={appShellStyles.preferencesBrandTitle}>{t('app:brandTitle')}</h2>
                </div>
                <div className={appShellStyles.preferencesHeaderTrailing}>
                    <div className={appShellStyles.preferencesAuthCard}>
                        <div className={appShellStyles.preferencesAuthActions}>
                            <button
                                type="button"
                                className={clsx(
                                    'ghost-button',
                                    'topbar-text-action',
                                    appShellStyles.preferencesHistoryButton
                                )}
                                aria-label={t('common:openDownloadHistory')}
                                title={t('common:openDownloadHistory')}
                                onClick={onOpenHistory}
                            >
                                <svg
                                    className={clsx(
                                        'action-icon',
                                        appShellStyles.preferencesHistoryIcon
                                    )}
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path
                                        d="M12 8v5l3.5 2.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.75"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className={clsx(
                                    'ghost-button',
                                    'topbar-text-action',
                                    appShellStyles.preferencesSessionsButton
                                )}
                                aria-label={t('common:openSiteSessions')}
                                title={t('common:openSiteSessions')}
                                onClick={onOpenSiteSessions}
                            >
                                <svg
                                    className={clsx(
                                        'action-icon',
                                        appShellStyles.preferencesSessionsIcon
                                    )}
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path
                                        d="M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className={clsx(
                                    'ghost-button',
                                    'topbar-text-action',
                                    appShellStyles.preferencesSettingsButton
                                )}
                                aria-label={t('common:openSettings')}
                                title={t('common:settings')}
                                onClick={onOpenSettings}
                            >
                                <svg
                                    className={clsx(
                                        'action-icon',
                                        appShellStyles.preferencesSettingsIcon
                                    )}
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path
                                        d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65ZM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
