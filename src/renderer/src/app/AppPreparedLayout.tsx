import { useTranslation } from 'react-i18next';
import { useSetupStore } from '../../../store/setupStore';
import { AppPreferencesPanel } from '../components/AppPreferencesPanel';
import { DownloadConcurrencyController } from '../components/DownloadConcurrencyController';
import { AppShell, AppShellWorkspace } from '../components/layout/AppShell';
import { useSlowIpcActive } from '../hooks/useSlowIpcActive';
import styles from './AppPreparedLayout.module.css';
import {
    useAppModals,
    useAppPlatform,
    useSettingsActions,
    useWorkflow
} from './context/AppControllerContext';
import { AppPreparedMainWorkspace } from './layout/AppPreparedMainWorkspace';
import { AppPreparedModalStack } from './layout/AppPreparedModalStack';

export function AppPreparedLayout(): React.JSX.Element {
    const { t } = useTranslation('app');
    const { platform } = useAppPlatform();
    const { settings } = useSettingsActions();
    const { pauseDownloadWithReason, resumeDownloadFromPause, startQueuedDownload } = useWorkflow();
    const { modal } = useAppModals();
    const preferencesVisible = useSetupStore((s) => !s.isCheckingSetup);
    const isSlowIpc = useSlowIpcActive();

    return (
        <AppShell platformClassName={`platform-${platform}`}>
            {isSlowIpc && (
                <div
                    className={styles.slowIpcBar}
                    role="status"
                    aria-live="polite"
                    aria-label={t('loadingIpc')}
                />
            )}
            <DownloadConcurrencyController
                maxConcurrentDownloads={settings.maxConcurrentDownloads}
                onPauseForConcurrency={pauseDownloadWithReason}
                onResumeFromConcurrency={resumeDownloadFromPause}
                onStartPending={startQueuedDownload}
            />

            <AppPreferencesPanel
                visible={preferencesVisible}
                onOpenSiteSessions={() => {
                    modal.setSettingsOpen(false);
                    modal.setHistoryModalOpen(false);
                    modal.setSiteSessionsModalOpen(true);
                }}
                onOpenHistory={() => {
                    modal.setSettingsOpen(false);
                    modal.setSiteSessionsModalOpen(false);
                    modal.setHistoryModalOpen(true);
                }}
                onOpenSettings={() => {
                    modal.setSiteSessionsModalOpen(false);
                    modal.setHistoryModalOpen(false);
                    modal.setSettingsOpen(true);
                }}
            />

            <AppShellWorkspace primary={<AppPreparedMainWorkspace />} />
            <AppPreparedModalStack />
        </AppShell>
    );
}
