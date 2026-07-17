import clsx from 'clsx';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { useDownloadStore } from '../../../../store/downloadStore';
import { AppSetupWorkflowSection } from '../../components/AppSetupWorkflowSection';
import DownloadQueue from '../../components/DownloadQueue';
import { ErrorFallback } from '../../components/ErrorFallback';
import SearchTab from '../../components/SearchTab';
import UrlInput from '../../components/UrlInput';
import workspaceStyles from '../../components/workspaceShared.module.css';
import layoutStyles from '../AppPreparedLayout.module.css';
import { useQueueActions, useSettingsActions, useWorkflow } from '../context/AppControllerContext';

type WorkspaceTab = 'download' | 'search';

const ACTIVE_DOWNLOAD_STATES = ['pending', 'starting', 'downloading', 'paused'] as const;

export function AppPreparedMainWorkspace(): React.JSX.Element {
    const { t } = useTranslation(['app', 'errors', 'components']);
    const {
        showSetupGate,
        error,
        workflowStateText,
        url,
        isFetchingInfo,
        clipboardHint,
        urlValidationError,
        canStartDownload,
        handleStartDownload,
        handleInstallYtdlp,
        setUrl,
        urlInputRef,
        previewQueueItem,
        effectivePreferredQuality,
        prependDownloads
    } = useWorkflow();
    const {
        handleSectionTrimPatch,
        handlePauseDownload,
        handleResumeDownload,
        handleRetryDownload,
        handleRemoveDownload,
        handlePauseBatch,
        handleResumeBatch,
        handleRemoveBatch,
        handleOpenDownloadedFile,
        handleRevealDownloadedFile
    } = useQueueActions();
    const { settings } = useSettingsActions();
    const [tab, setTab] = useState<WorkspaceTab>('download');
    const activeDownloadCount = useDownloadStore((state) =>
        state.queue.reduce(
            (count, item) =>
                count +
                (ACTIVE_DOWNLOAD_STATES.includes(
                    item.state as (typeof ACTIVE_DOWNLOAD_STATES)[number]
                )
                    ? 1
                    : 0),
            0
        )
    );
    const showDownloadTabBadge = tab === 'search' && activeDownloadCount > 0;

    if (showSetupGate) {
        return (
            <AppSetupWorkflowSection
                error={error}
                onInstallYtdlp={() => {
                    void handleInstallYtdlp();
                }}
            />
        );
    }

    const tabs: { id: WorkspaceTab; label: string }[] = [
        { id: 'download', label: t('components:urlInput.download') },
        { id: 'search', label: t('components:search.tabSearch') }
    ];

    return (
        <section
            id="workflow-region"
            className={layoutStyles.workflowLayout}
            aria-labelledby="workflow-heading"
        >
            <h2 id="workflow-heading" className="sr-only">
                {t('app:workflowHeading')}
            </h2>
            <p className="sr-only" aria-live="polite">
                {workflowStateText}
            </p>

            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <section
                    className={workspaceStyles.workspace}
                    aria-label={t('components:search.workspaceAria')}
                >
                    <div className={workspaceStyles.tabbar}>
                        <div
                            className={workspaceStyles.tabs}
                            role="tablist"
                            aria-label={t('components:search.tablistAria')}
                        >
                            {tabs.map((x) => {
                                const showBadge = x.id === 'download' && showDownloadTabBadge;
                                return (
                                    <button
                                        key={x.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === x.id}
                                        className={clsx(
                                            workspaceStyles.tab,
                                            tab === x.id && 'is-active'
                                        )}
                                        onClick={() => setTab(x.id)}
                                    >
                                        <span className={workspaceStyles.tabLabel}>
                                            {x.label}
                                            {showBadge ? (
                                                <span
                                                    className={workspaceStyles.tabBadge}
                                                    title={t(
                                                        'components:search.activeDownloadsBadgeAria',
                                                        { count: activeDownloadCount }
                                                    )}
                                                >
                                                    {activeDownloadCount}
                                                </span>
                                            ) : null}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {tab === 'download' && (
                        <div className={workspaceStyles.panel}>
                            <UrlInput
                                embedded
                                value={url}
                                isLoading={isFetchingInfo}
                                clipboardHint={clipboardHint}
                                errorText={urlValidationError || error}
                                isSubmitDisabled={!canStartDownload}
                                onSubmit={handleStartDownload}
                                onChange={setUrl}
                                inputRef={urlInputRef}
                            />
                        </div>
                    )}

                    <SearchTab
                        visible={tab === 'search'}
                        outputDir={settings.outputDir}
                        prependDownloads={prependDownloads}
                        defaultYoutubeSearchQualityMax={effectivePreferredQuality}
                    />
                </section>
            </ErrorBoundary>
            {tab === 'download' && (
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <DownloadQueue
                        previewItem={previewQueueItem}
                        onSectionTrimPatch={handleSectionTrimPatch}
                        onPause={handlePauseDownload}
                        onResume={handleResumeDownload}
                        onRetry={handleRetryDownload}
                        onRemove={handleRemoveDownload}
                        onPauseBatch={handlePauseBatch}
                        onResumeBatch={handleResumeBatch}
                        onRemoveBatch={handleRemoveBatch}
                        onOpenFile={handleOpenDownloadedFile}
                        onRevealFile={handleRevealDownloadedFile}
                    />
                </ErrorBoundary>
            )}
        </section>
    );
}
