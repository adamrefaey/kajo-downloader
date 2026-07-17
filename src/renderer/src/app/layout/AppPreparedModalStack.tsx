import { lazy, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useSignedSitesStore } from '../../../../store/signedSitesStore';
import { ErrorFallback } from '../../components/ErrorFallback';
import {
    useAppModals,
    useQueueActions,
    useSettingsActions,
    useWorkflow
} from '../context/AppControllerContext';

const MultiVideoPickerModal = lazy(() => import('../../components/MultiVideoPickerModal'));
const YoutubeWatchPlaylistForkModal = lazy(
    () => import('../../components/YoutubeWatchPlaylistForkModal')
);
const SiteSessionsModal = lazy(() => import('../../components/SiteSessionsModal'));
const DownloadHistoryModal = lazy(() => import('../../components/DownloadHistoryModal'));
const SiteAuthBrowserModal = lazy(() => import('../../components/SiteAuthBrowserModal'));
const SettingsModal = lazy(() => import('../../components/SettingsModal'));

export function AppPreparedModalStack(): React.JSX.Element {
    const {
        modal,
        multiPicker,
        multiPickerChannelTabEntries,
        handleMultiPickerConfirm,
        handleOpenSiteAuthFromSessions,
        handleQueueLikedVideos,
        handleQueueWatchLater,
        youtubeWatchPlaylistForkModalOpen,
        handleYoutubeWatchPlaylistForkVideo,
        handleYoutubeWatchPlaylistForkPlaylist,
        handleYoutubeWatchPlaylistForkDismiss,
        handleMultilineMultiPickerDismiss
    } = useAppModals();

    const {
        numberPlaylistItems,
        setNumberPlaylistItems,
        isYoutubeLibraryQueueing,
        isStartingDownload,
        metadataResolve,
        setMetadataResolveRefreshKey
    } = useWorkflow();
    const {
        settings,
        handleSelectOutputFolder,
        handlePreferredQualityChange,
        clampedConcurrent,
        handleMaxConcurrentDownloadsChange,
        CONCURRENT_DOWNLOAD_OPTIONS,
        handleUiLocaleChange,
        handleSaveProxyUrl,
        handlePatchNotificationSettings,
        handlePatchAdvancedDownloadDefaults,
        handleCustomFilenameTemplateChange
    } = useSettingsActions();
    const { prependDownloads } = useWorkflow();
    const { handleOpenDownloadedFile, handleRevealDownloadedFile } = useQueueActions();

    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense>
                {youtubeWatchPlaylistForkModalOpen && (
                    <YoutubeWatchPlaylistForkModal
                        open={youtubeWatchPlaylistForkModalOpen}
                        onClose={handleYoutubeWatchPlaylistForkDismiss}
                        onChooseVideo={handleYoutubeWatchPlaylistForkVideo}
                        onChoosePlaylist={handleYoutubeWatchPlaylistForkPlaylist}
                    />
                )}
                {multiPicker.multiPickerOpen && (
                    <MultiVideoPickerModal
                        open={multiPicker.multiPickerOpen}
                        onClose={() => {
                            handleMultilineMultiPickerDismiss();
                            multiPicker.resetMultiPicker();
                        }}
                        collectionTitle={multiPicker.multiPickerPlaylist?.title ?? ''}
                        entries={multiPicker.multiPickerPlaylist?.entries ?? []}
                        numberPlaylistItems={numberPlaylistItems}
                        onNumberPlaylistItemsChange={setNumberPlaylistItems}
                        channelTabs={
                            multiPicker.multiPickerChannelTabs
                                ? {
                                      tabs: multiPicker.multiPickerChannelTabs,
                                      activeTab: multiPicker.multiPickerChannelActiveTab,
                                      onTabChange: multiPicker.setMultiPickerChannelActiveTab,
                                      tabEntries: multiPickerChannelTabEntries,
                                      tabLoading: multiPicker.multiPickerChannelTabLoading,
                                      tabError: multiPicker.multiPickerChannelTabError
                                  }
                                : null
                        }
                        plainPlaylistStreaming={multiPicker.multiPickerPlainPlaylistStreaming}
                        plainPlaylistError={multiPicker.multiPickerPlainPlaylistError}
                        onConfirm={(selected) => {
                            void handleMultiPickerConfirm(selected);
                        }}
                    />
                )}
                {modal.siteSessionsModalOpen && (
                    <SiteSessionsModal
                        open={modal.siteSessionsModalOpen}
                        onClose={() => modal.setSiteSessionsModalOpen(false)}
                        onOpenSiteAuth={handleOpenSiteAuthFromSessions}
                        youtubeLibraryQueue={{
                            hasOutputDir: Boolean(settings.outputDir?.trim()),
                            busy: isYoutubeLibraryQueueing,
                            disabledForMainWorkflow:
                                isStartingDownload && !isYoutubeLibraryQueueing,
                            onQueueLikedVideos: handleQueueLikedVideos,
                            onQueueWatchLater: handleQueueWatchLater
                        }}
                    />
                )}
                {modal.historyModalOpen && (
                    <DownloadHistoryModal
                        open={modal.historyModalOpen}
                        onClose={() => modal.setHistoryModalOpen(false)}
                        outputDir={settings.outputDir}
                        preferredQuality={settings.preferredQuality}
                        prependDownloads={prependDownloads}
                        onOpenFile={handleOpenDownloadedFile}
                        onRevealFile={handleRevealDownloadedFile}
                    />
                )}
                {modal.siteAuthModalOpen && (
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <SiteAuthBrowserModal
                            open={modal.siteAuthModalOpen}
                            resolve={
                                modal.siteAuthManualOpen
                                    ? null
                                    : metadataResolve?.kind === 'auth-required'
                                      ? metadataResolve
                                      : null
                            }
                            manualOpen={modal.siteAuthManualOpen}
                            onClose={modal.closeSiteAuthModals}
                            onSaved={() => {
                                setMetadataResolveRefreshKey((k) => k + 1);
                                void useSignedSitesStore.getState().refreshFromMain();
                            }}
                        />
                    </ErrorBoundary>
                )}
                {modal.settingsOpen && (
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <SettingsModal
                            open={modal.settingsOpen}
                            onClose={() => modal.setSettingsOpen(false)}
                            outputDir={settings.outputDir}
                            onSelectOutputFolder={handleSelectOutputFolder}
                            preferredQuality={settings.preferredQuality}
                            onPreferredQualityChange={handlePreferredQualityChange}
                            maxConcurrentDownloads={clampedConcurrent}
                            onMaxConcurrentDownloadsChange={handleMaxConcurrentDownloadsChange}
                            concurrentOptions={CONCURRENT_DOWNLOAD_OPTIONS}
                            uiLocale={settings.uiLocale ?? ''}
                            onUiLocaleChange={handleUiLocaleChange}
                            proxyConfigured={settings.proxyConfigured}
                            onSaveProxyUrl={handleSaveProxyUrl}
                            advancedDownloadDefaults={settings.advancedDownloadDefaults}
                            customFilenameTemplate={settings.customFilenameTemplate}
                            onPatchAdvancedDownloadDefaults={handlePatchAdvancedDownloadDefaults}
                            onCustomFilenameTemplateChange={handleCustomFilenameTemplateChange}
                            notificationSettings={settings.notificationSettings}
                            onPatchNotificationSettings={handlePatchNotificationSettings}
                        />
                    </ErrorBoundary>
                )}
            </Suspense>
        </ErrorBoundary>
    );
}
