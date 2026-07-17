import clsx from 'clsx';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdvancedDownloadDefaultsPatch } from '../../../shared/advancedDownloadSettings';
import type { AdvancedDownloadDefaults, NotificationSettings } from '../../../types';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import shell from './DialogOverlay.module.css';
import SettingsDownloadsTab from './SettingsDownloadsTab';
import SettingsGeneralTab from './SettingsGeneralTab';
import styles from './SettingsModal.module.css';
import ppStyles from './workspaceShared.module.css';

type SettingsTabId = 'general' | 'downloads';

type SettingsModalProps = {
    open: boolean;
    onClose: () => void;
    outputDir: string;
    onSelectOutputFolder: () => void | Promise<void>;
    preferredQuality: number | null;
    onPreferredQualityChange: (value: string) => void | Promise<void>;
    maxConcurrentDownloads: number;
    onMaxConcurrentDownloadsChange: (value: string) => void | Promise<void>;
    concurrentOptions: Array<{ value: number; label: string }>;
    uiLocale: string;
    onUiLocaleChange: (value: string) => void | Promise<void>;
    proxyConfigured: boolean;
    onSaveProxyUrl: (url: string | null) => void | Promise<void>;
    advancedDownloadDefaults: AdvancedDownloadDefaults;
    customFilenameTemplate: string | undefined;
    onPatchAdvancedDownloadDefaults: (patch: AdvancedDownloadDefaultsPatch) => void | Promise<void>;
    onCustomFilenameTemplateChange: (value: string) => void | Promise<void>;
    notificationSettings: NotificationSettings;
    onPatchNotificationSettings: (patch: Partial<NotificationSettings>) => void | Promise<void>;
};

export default function SettingsModal({
    open,
    onClose,
    outputDir,
    onSelectOutputFolder,
    preferredQuality,
    onPreferredQualityChange,
    maxConcurrentDownloads,
    onMaxConcurrentDownloadsChange,
    concurrentOptions,
    uiLocale,
    onUiLocaleChange,
    proxyConfigured,
    onSaveProxyUrl,
    advancedDownloadDefaults,
    customFilenameTemplate,
    onPatchAdvancedDownloadDefaults,
    onCustomFilenameTemplateChange,
    notificationSettings,
    onPatchNotificationSettings
}: SettingsModalProps): React.JSX.Element | null {
    const { t } = useTranslation('components');
    const { t: tCommon } = useTranslation('common');

    const [proxyUrlDraft, setProxyUrlDraft] = useState('');
    const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
    const [isTabPending, startTabTransition] = useTransition();
    const dialogRootRef = useRef<HTMLDivElement>(null);
    useModalFocusTrap(dialogRootRef, open);

    const visibleTabIds: SettingsTabId[] = ['general', 'downloads'];

    const [prevOpenForTabs, setPrevOpenForTabs] = useState(open);
    if (open !== prevOpenForTabs) {
        setPrevOpenForTabs(open);
        if (open) {
            setActiveTab('general');
            setProxyUrlDraft('');
        }
    }

    const preferredQualityOptions: Array<{ label: string; value: number | null }> = [
        { label: t('settings.qualityHighest'), value: null },
        { label: t('settings.quality4320'), value: 4320 },
        { label: t('settings.quality2160'), value: 2160 },
        { label: t('settings.quality1440'), value: 1440 },
        { label: t('settings.quality1080'), value: 1080 },
        { label: t('settings.quality720'), value: 720 },
        { label: t('settings.quality480'), value: 480 },
        { label: t('settings.quality360'), value: 360 },
        { label: t('settings.quality240'), value: 240 },
        { label: t('settings.quality144'), value: 144 }
    ];

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    const resolveTabLabel = (id: SettingsTabId): string => {
        switch (id) {
            case 'general':
                return t('settings.tabGeneral');
            case 'downloads':
                return t('settings.tabDownloads');
            default:
                return id;
        }
    };

    return (
        <div
            ref={dialogRootRef}
            className={clsx(shell.overlay, shell.overlayGrid, shell.overlaySettingsZ)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
        >
            <button
                type="button"
                className={shell.backdropHit}
                aria-label={t('settings.closeAria')}
                onClick={onClose}
            />
            <div
                className={clsx(
                    'panel',
                    shell.modal,
                    shell.modalInGrid,
                    styles.dialog,
                    'settings-modal'
                )}
            >
                <div className={clsx(shell.modalHead, 'settings-modal-head')}>
                    <h2 id="settings-modal-title">{t('settings.title')}</h2>
                    <button
                        type="button"
                        className="ghost-button"
                        aria-label={t('settings.closeAria')}
                        onClick={onClose}
                    >
                        {tCommon('close')}
                    </button>
                </div>

                {visibleTabIds.length > 1 ? (
                    <div
                        className="settings-modal-tabbar"
                        role="tablist"
                        aria-label={t('settings.tabsAria')}
                    >
                        <div className={clsx(ppStyles.tabs, 'settings-modal-tabs')}>
                            {visibleTabIds.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    id={`settings-tab-${id}`}
                                    aria-selected={activeTab === id}
                                    aria-controls={`settings-tab-panel-${id}`}
                                    className={clsx(ppStyles.tab, activeTab === id && 'is-active')}
                                    onClick={() =>
                                        startTabTransition(() => {
                                            setActiveTab(id);
                                        })
                                    }
                                >
                                    {resolveTabLabel(id)}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div
                    className="settings-tab-content"
                    style={isTabPending ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
                >
                    {activeTab === 'general' ? (
                        <SettingsGeneralTab
                            outputDir={outputDir}
                            onSelectOutputFolder={onSelectOutputFolder}
                            uiLocale={uiLocale}
                            onUiLocaleChange={onUiLocaleChange}
                            preferredQuality={preferredQuality}
                            onPreferredQualityChange={onPreferredQualityChange}
                            preferredQualityOptions={preferredQualityOptions}
                            maxConcurrentDownloads={maxConcurrentDownloads}
                            onMaxConcurrentDownloadsChange={onMaxConcurrentDownloadsChange}
                            concurrentOptions={concurrentOptions}
                            notificationSettings={notificationSettings}
                            onPatchNotificationSettings={onPatchNotificationSettings}
                        />
                    ) : null}

                    {activeTab === 'downloads' ? (
                        <SettingsDownloadsTab
                            advancedDownloadDefaults={advancedDownloadDefaults}
                            customFilenameTemplate={customFilenameTemplate}
                            proxyUrlDraft={proxyUrlDraft}
                            setProxyUrlDraft={setProxyUrlDraft}
                            proxyConfigured={proxyConfigured}
                            onSaveProxyUrl={onSaveProxyUrl}
                            onPatchAdvancedDownloadDefaults={onPatchAdvancedDownloadDefaults}
                            onCustomFilenameTemplateChange={onCustomFilenameTemplateChange}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}
