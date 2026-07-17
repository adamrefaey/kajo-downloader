import { useTranslation } from 'react-i18next';
import type { NotificationSettings } from '../../../types';
import CustomSelect from './CustomSelect';
import LanguageSelectControl from './LanguageSelectControl';

type PreferredQualityOption = { label: string; value: number | null };

type SettingsGeneralTabProps = {
    outputDir: string;
    onSelectOutputFolder: () => void | Promise<void>;
    uiLocale: string;
    onUiLocaleChange: (value: string) => void | Promise<void>;
    preferredQuality: number | null;
    onPreferredQualityChange: (value: string) => void | Promise<void>;
    preferredQualityOptions: PreferredQualityOption[];
    maxConcurrentDownloads: number;
    onMaxConcurrentDownloadsChange: (value: string) => void | Promise<void>;
    concurrentOptions: Array<{ value: number; label: string }>;
    notificationSettings: NotificationSettings;
    onPatchNotificationSettings: (patch: Partial<NotificationSettings>) => void | Promise<void>;
};

const outputFolderPathId = 'settings-output-folder-path';
const localeControlId = 'settings-ui-locale-control';
const preferredQualitySelectId = 'settings-preferred-quality-select';
const maxConcurrentSelectId = 'settings-max-concurrent-downloads-select';

export default function SettingsGeneralTab({
    outputDir,
    onSelectOutputFolder,
    uiLocale,
    onUiLocaleChange,
    preferredQuality,
    onPreferredQualityChange,
    preferredQualityOptions,
    maxConcurrentDownloads,
    onMaxConcurrentDownloadsChange,
    concurrentOptions,
    notificationSettings,
    onPatchNotificationSettings
}: SettingsGeneralTabProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const { t: tCommon } = useTranslation('common');

    return (
        <div
            className="settings-tab-panel"
            id="settings-tab-panel-general"
            role="tabpanel"
            aria-labelledby="settings-tab-general"
        >
            <fieldset className="settings-modal-grid">
                <legend className="sr-only">{t('settings.legendDefaults')}</legend>
                <div className="toolbar-setting-card toolbar-setting-card-location">
                    <div className="toolbar-setting-head">
                        <span className="toolbar-setting-eyebrow">
                            {t('settings.downloadLocation')}
                        </span>
                    </div>
                    <div className="toolbar-folder-segment">
                        <code id={outputFolderPathId} className="compact-folder-path" dir="ltr">
                            {outputDir || '--'}
                        </code>
                        <button
                            type="button"
                            className="ghost-button topbar-text-action"
                            onClick={() => void onSelectOutputFolder()}
                            aria-describedby={outputFolderPathId}
                            title={t('settings.changeLocationTitle')}
                        >
                            {t('settings.change')}
                        </button>
                    </div>
                </div>
                <div className="toolbar-setting-card">
                    <div className="toolbar-setting-head">
                        <label htmlFor={localeControlId} className="toolbar-setting-eyebrow">
                            {tCommon('language')}
                        </label>
                    </div>
                    <LanguageSelectControl
                        controlId={localeControlId}
                        uiLocale={uiLocale}
                        onChange={(value) => void onUiLocaleChange(value)}
                    />
                </div>
                <div className="toolbar-setting-card">
                    <div className="toolbar-setting-head">
                        <label
                            htmlFor={preferredQualitySelectId}
                            className="toolbar-setting-eyebrow"
                        >
                            {t('settings.favoriteQuality')}
                        </label>
                    </div>
                    <CustomSelect
                        id={preferredQualitySelectId}
                        className="toolbar-setting-select"
                        value={preferredQuality === null ? '' : String(preferredQuality)}
                        onChange={(value) => void onPreferredQualityChange(value)}
                        options={preferredQualityOptions.map((option) => ({
                            value: option.value === null ? '' : String(option.value),
                            label: option.label
                        }))}
                    />
                </div>
                <div className="toolbar-setting-card">
                    <div className="toolbar-setting-head">
                        <label
                            htmlFor={maxConcurrentSelectId}
                            className="toolbar-setting-eyebrow"
                            title={t('settings.concurrentTitle')}
                        >
                            {t('settings.concurrentDownloads')}
                        </label>
                    </div>
                    <CustomSelect
                        id={maxConcurrentSelectId}
                        className="toolbar-setting-select toolbar-concurrency-select"
                        value={String(maxConcurrentDownloads)}
                        onChange={(value) => void onMaxConcurrentDownloadsChange(value)}
                        options={concurrentOptions.map((option) => ({
                            value: String(option.value),
                            label: option.label
                        }))}
                    />
                </div>
            </fieldset>

            <section className="settings-section" aria-labelledby="settings-notify-heading">
                <h3 id="settings-notify-heading" className="settings-section-heading">
                    {t('settings.notificationsTitle')}
                </h3>
                <p className="settings-section-hint">{t('settings.notificationsHint')}</p>
                <div className="settings-modal-grid settings-quick-grid">
                    <div className="toolbar-setting-card settings-toggles">
                        <label className="settings-checkbox-row">
                            <input
                                type="checkbox"
                                checked={notificationSettings.enabled}
                                onChange={(e) =>
                                    void onPatchNotificationSettings({ enabled: e.target.checked })
                                }
                            />
                            {t('settings.notificationsEnable')}
                        </label>
                        <label className="settings-checkbox-row">
                            <input
                                type="checkbox"
                                checked={notificationSettings.onDownloadComplete}
                                disabled={!notificationSettings.enabled}
                                onChange={(e) =>
                                    void onPatchNotificationSettings({
                                        onDownloadComplete: e.target.checked
                                    })
                                }
                            />
                            {t('settings.notifyOnComplete')}
                        </label>
                        <label className="settings-checkbox-row">
                            <input
                                type="checkbox"
                                checked={notificationSettings.onDownloadError}
                                disabled={!notificationSettings.enabled}
                                onChange={(e) =>
                                    void onPatchNotificationSettings({
                                        onDownloadError: e.target.checked
                                    })
                                }
                            />
                            {t('settings.notifyOnError')}
                        </label>
                        <label className="settings-checkbox-row">
                            <input
                                type="checkbox"
                                checked={notificationSettings.batchSummary}
                                disabled={!notificationSettings.enabled}
                                onChange={(e) =>
                                    void onPatchNotificationSettings({
                                        batchSummary: e.target.checked
                                    })
                                }
                            />
                            {t('settings.notifyBatchSummary')}
                        </label>
                    </div>
                </div>
            </section>
        </div>
    );
}
