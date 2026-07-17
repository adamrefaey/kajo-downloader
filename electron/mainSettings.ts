import type ElectronStore from 'electron-store';
import { normalizeAdvancedDownloadDefaults } from '../src/shared/advancedDownloadSettings';
import type { SetSettingsPayload, StartDownloadPayload } from '../src/shared/ipcContract';
import {
    type AppSettings,
    DEFAULT_NOTIFICATION_SETTINGS,
    MAX_SUPPORTED_VIDEO_HEIGHT,
    type NotificationSettings
} from '../src/types';
import type { SettingsDisk } from './ipc/types';
import { isRecord } from './lib/guards';
import { isAcceptableOutputDir, resolveTrustedOutputDir } from './lib/validateOutputDir';
import {
    mergeAdvancedDownloadDefaultsStored,
    sanitizeAdvancedDownloadDefaultsPatch
} from './services/downloadCapabilities';
import { toYtdlpTemplate, validateFilenameTemplate } from './services/filenameTemplate';
import { DEFAULT_PROXY_PROFILE_ID, isProxyProfileConfigured } from './services/proxyProfileStore';

export const MAX_CONCURRENT_DOWNLOADS = 8;

type HeavyMods = {
    caps: typeof import('./services/downloadCapabilities');
};

export function createMainSettingsApi(options: {
    settingsStore: ElectronStore<SettingsDisk>;
    defaultDiskSettings: SettingsDisk;
    getHeavyMods: () => HeavyMods;
}): {
    getSettings: () => AppSettings;
    applySettingsPatch: (patch: SetSettingsPayload) => AppSettings;
    resolveEffectiveOutputTemplate: (
        payload: StartDownloadPayload,
        advancedDefaults: ReturnType<typeof normalizeAdvancedDownloadDefaults>
    ) => string;
} {
    const { settingsStore, defaultDiskSettings, getHeavyMods } = options;

    function clampPreferredQuality(value: unknown): number | null {
        if (value === null) {
            return null;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return defaultDiskSettings.preferredQuality;
        }
        if (value > MAX_SUPPORTED_VIDEO_HEIGHT) {
            return MAX_SUPPORTED_VIDEO_HEIGHT;
        }
        return value;
    }

    function sanitizeNotificationSettings(raw: unknown): NotificationSettings {
        const d = DEFAULT_NOTIFICATION_SETTINGS;
        if (!isRecord(raw)) {
            return { ...d };
        }
        return {
            enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
            onDownloadComplete:
                typeof raw.onDownloadComplete === 'boolean'
                    ? raw.onDownloadComplete
                    : d.onDownloadComplete,
            onDownloadError:
                typeof raw.onDownloadError === 'boolean' ? raw.onDownloadError : d.onDownloadError,
            batchSummary: typeof raw.batchSummary === 'boolean' ? raw.batchSummary : d.batchSummary
        };
    }

    function mergeNotificationSettingsPatch(
        raw: unknown,
        prev: NotificationSettings
    ): NotificationSettings {
        if (!isRecord(raw)) {
            return prev;
        }
        return {
            enabled: typeof raw.enabled === 'boolean' ? raw.enabled : prev.enabled,
            onDownloadComplete:
                typeof raw.onDownloadComplete === 'boolean'
                    ? raw.onDownloadComplete
                    : prev.onDownloadComplete,
            onDownloadError:
                typeof raw.onDownloadError === 'boolean'
                    ? raw.onDownloadError
                    : prev.onDownloadError,
            batchSummary:
                typeof raw.batchSummary === 'boolean' ? raw.batchSummary : prev.batchSummary
        };
    }

    function resolveEffectiveOutputTemplate(
        payload: StartDownloadPayload,
        advancedDefaults: ReturnType<typeof normalizeAdvancedDownloadDefaults>
    ): string {
        const { caps } = getHeavyMods();
        if (typeof payload.outputTemplate === 'string' && payload.outputTemplate.trim()) {
            const v = caps.validateOutputFilenameTemplate(payload.outputTemplate);
            if (v) {
                return v;
            }
        }
        // Custom filename template ({{var}} format, converted to yt-dlp).
        const rawTpl = settingsStore.get('customFilenameTemplate');
        if (typeof rawTpl === 'string' && rawTpl.trim()) {
            const validation = validateFilenameTemplate(rawTpl);
            if (validation.valid) {
                const ytTpl = toYtdlpTemplate(rawTpl);
                const v = caps.validateOutputFilenameTemplate(ytTpl);
                if (v) return v;
            }
        }
        const v = caps.validateOutputFilenameTemplate(advancedDefaults.filenameTemplate);
        if (v) {
            return v;
        }
        return '%(title)s.%(ext)s';
    }

    function getSettings(): AppSettings {
        const rawConcurrent = Number(settingsStore.get('maxConcurrentDownloads'));
        const maxConcurrentDownloads = Number.isFinite(rawConcurrent)
            ? Math.max(1, Math.min(MAX_CONCURRENT_DOWNLOADS, Math.floor(rawConcurrent)))
            : 1;
        const uiLocaleRaw = settingsStore.get('uiLocale');
        const advancedDownloadDefaults = normalizeAdvancedDownloadDefaults(
            settingsStore.get('advancedDownloadDefaults')
        );
        const proxyId = advancedDownloadDefaults.proxy.profileId || DEFAULT_PROXY_PROFILE_ID;
        const outputDir = resolveTrustedOutputDir(
            settingsStore.get('outputDir'),
            defaultDiskSettings.outputDir
        );
        // Heal a tampered / relative store value so confinement roots stay absolute.
        if (settingsStore.get('outputDir') !== outputDir) {
            settingsStore.set('outputDir', outputDir);
        }
        return {
            outputDir,
            maxConcurrentDownloads,
            preferredQuality: clampPreferredQuality(settingsStore.get('preferredQuality')),
            uiLocale: typeof uiLocaleRaw === 'string' ? uiLocaleRaw : '',
            advancedDownloadDefaults,
            proxyConfigured: isProxyProfileConfigured(proxyId),
            notificationSettings: sanitizeNotificationSettings(
                settingsStore.get('notificationSettings')
            ),
            customFilenameTemplate: (() => {
                const raw = settingsStore.get('customFilenameTemplate');
                return typeof raw === 'string' && raw.trim() ? raw : undefined;
            })()
        };
    }

    function applySettingsPatch(patch: SetSettingsPayload): AppSettings {
        if (patch.outputDir !== undefined && isAcceptableOutputDir(patch.outputDir)) {
            settingsStore.set(
                'outputDir',
                resolveTrustedOutputDir(patch.outputDir, defaultDiskSettings.outputDir)
            );
        }

        if (patch.maxConcurrentDownloads !== undefined) {
            const raw = Number(patch.maxConcurrentDownloads);
            const n = Number.isFinite(raw)
                ? Math.max(1, Math.min(MAX_CONCURRENT_DOWNLOADS, Math.floor(raw)))
                : 1;
            settingsStore.set('maxConcurrentDownloads', n);
        }

        if (patch.preferredQuality !== undefined) {
            settingsStore.set('preferredQuality', clampPreferredQuality(patch.preferredQuality));
        }

        if (patch.uiLocale !== undefined) {
            settingsStore.set('uiLocale', typeof patch.uiLocale === 'string' ? patch.uiLocale : '');
        }

        if (patch.notificationSettings !== undefined) {
            const prev = sanitizeNotificationSettings(settingsStore.get('notificationSettings'));
            settingsStore.set(
                'notificationSettings',
                mergeNotificationSettingsPatch(patch.notificationSettings, prev)
            );
        }

        if (patch.advancedDownloadDefaults !== undefined) {
            const defaultsPatch = sanitizeAdvancedDownloadDefaultsPatch(
                patch.advancedDownloadDefaults
            );
            if (defaultsPatch) {
                settingsStore.set(
                    'advancedDownloadDefaults',
                    mergeAdvancedDownloadDefaultsStored(
                        settingsStore.get('advancedDownloadDefaults'),
                        defaultsPatch
                    )
                );
            }
        }

        if (patch.customFilenameTemplate !== undefined) {
            const raw = patch.customFilenameTemplate;
            if (typeof raw === 'string' && raw.trim()) {
                settingsStore.set('customFilenameTemplate', raw.trim());
            } else {
                settingsStore.delete('customFilenameTemplate');
            }
        }

        return getSettings();
    }

    return {
        getSettings,
        applySettingsPatch,
        resolveEffectiveOutputTemplate
    };
}
