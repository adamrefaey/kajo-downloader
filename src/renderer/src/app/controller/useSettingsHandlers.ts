import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import type { AdvancedDownloadDefaultsPatch } from '../../../../shared/advancedDownloadSettings';
import { useDownloadStore } from '../../../../store/downloadStore';
import type { AppSettings, NotificationSettings } from '../../../../types';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';
import { MAX_CONCURRENT_DOWNLOADS_UI } from '../appConstants';

export type UseSettingsHandlersOptions = {
    t: TFunction;
    setError: Dispatch<SetStateAction<string | null>>;
    hydrateSettings: (s: AppSettings | null) => void;
};

export function useSettingsHandlers({ t, setError, hydrateSettings }: UseSettingsHandlersOptions): {
    handleSelectOutputFolder: () => Promise<void>;
    handlePreferredQualityChange: (value: string) => Promise<void>;
    handleMaxConcurrentDownloadsChange: (value: string) => Promise<void>;
    handleUiLocaleChange: (value: string) => Promise<void>;
    handlePatchNotificationSettings: (patch: Partial<NotificationSettings>) => Promise<void>;
    handleSaveProxyUrl: (url: string | null) => Promise<void>;
    handlePatchAdvancedDownloadDefaults: (patch: AdvancedDownloadDefaultsPatch) => Promise<void>;
    handleCustomFilenameTemplateChange: (value: string) => Promise<void>;
} {
    const handleSelectOutputFolder = async (): Promise<void> => {
        try {
            const selected = await window.api.selectOutputFolder();
            if (!selected) {
                return;
            }
            const next = await window.api.setSettings({ outputDir: selected });
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedOutputFolder')));
        }
    };

    const handlePreferredQualityChange = async (value: string): Promise<void> => {
        const nextValue = value ? Number.parseInt(value, 10) : null;
        const preferredQuality = Number.isNaN(nextValue as number) ? null : nextValue;

        try {
            const next = await window.api.setSettings({ preferredQuality });
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedPreferredQuality')));
        }
    };

    const handleMaxConcurrentDownloadsChange = async (value: string): Promise<void> => {
        const parsed = Number.parseInt(value, 10);
        const maxConcurrentDownloads = Number.isFinite(parsed)
            ? Math.max(1, Math.min(MAX_CONCURRENT_DOWNLOADS_UI, parsed))
            : 1;

        try {
            const next = await window.api.setSettings({ maxConcurrentDownloads });
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedConcurrentLimit')));
        }
    };

    const handleUiLocaleChange = async (value: string): Promise<void> => {
        try {
            const next = await window.api?.setSettings({ uiLocale: value });
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedLoadSettings')));
        }
    };

    const handlePatchNotificationSettings = async (
        patch: Partial<NotificationSettings>
    ): Promise<void> => {
        if (!window.api) {
            return;
        }
        try {
            const prev = useDownloadStore.getState().settings.notificationSettings;
            const next = await window.api.setSettings({
                notificationSettings: { ...prev, ...patch }
            } as Partial<AppSettings>);
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedLoadSettings')));
        }
    };

    const handleSaveProxyUrl = async (url: string | null): Promise<void> => {
        if (!window.api?.setProxyProfileUrl) {
            return;
        }
        try {
            const r = await window.api.setProxyProfileUrl({ profileId: 'default', url });
            if (r && !r.ok) {
                setError(r.error);
                return;
            }
            const next = await window.api.getSettings();
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedLoadSettings')));
        }
    };

    const handlePatchAdvancedDownloadDefaults = async (
        patch: AdvancedDownloadDefaultsPatch
    ): Promise<void> => {
        if (!window.api) {
            return;
        }
        try {
            const next = await window.api.setSettings({ advancedDownloadDefaults: patch });
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedLoadSettings')));
        }
    };

    const handleCustomFilenameTemplateChange = async (value: string): Promise<void> => {
        if (!window.api) {
            return;
        }
        const trimmed = value.trim();
        try {
            const next = await window.api.setSettings({
                customFilenameTemplate: trimmed
            });
            if (next) {
                hydrateSettings(next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedLoadSettings')));
        }
    };

    return {
        handleSelectOutputFolder,
        handlePreferredQualityChange,
        handleMaxConcurrentDownloadsChange,
        handleUiLocaleChange,
        handlePatchNotificationSettings,
        handleSaveProxyUrl,
        handlePatchAdvancedDownloadDefaults,
        handleCustomFilenameTemplateChange
    };
}
