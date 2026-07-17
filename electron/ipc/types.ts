import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type ElectronStore from 'electron-store';
import type { normalizeAdvancedDownloadDefaults } from '../../src/shared/advancedDownloadSettings';
import type {
    PrepareChannelOutputDirPayload,
    PrepareChannelOutputDirResult,
    PreparePlaylistOutputDirPayload,
    SetSettingsPayload,
    StartDownloadPayload
} from '../../src/shared/ipcPayloadSchemas';
import type { AppSettings, SetupStatus } from '../../src/types';
import type { FetchMetadataOptions } from '../services/metadata/types';

export type {
    CleanupDownloadArtifactsPayload,
    PrepareChannelOutputDirPayload,
    PrepareChannelOutputDirResult,
    PreparePlaylistOutputDirPayload,
    SetProxyProfileUrlPayload,
    SetSettingsPayload,
    StartDownloadPayload
} from '../../src/shared/ipcPayloadSchemas';

export interface SettingsDisk {
    outputDir: string;
    maxConcurrentDownloads: number;
    preferredQuality: number | null;
    uiLocale: string;
    advancedDownloadDefaults?: unknown;
    notificationSettings?: unknown;
    customFilenameTemplate?: string;
}

export interface IpcHandlerDeps {
    getMainWindow: () => BrowserWindow | null;
    settingsStore: ElectronStore<SettingsDisk>;
    isValidIpcSender: (event: Pick<IpcMainInvokeEvent, 'senderFrame' | 'sender'>) => boolean;
    resolveFetchMetadataOptions: () => Promise<FetchMetadataOptions>;
    loadMetadataService: () => Promise<typeof import('../services/metadata')>;
    loadYtdlpService: () => Promise<typeof import('../services/ytdlp')>;
    getSettings: () => AppSettings;
    applySettingsPatch: (patch: SetSettingsPayload) => AppSettings;
    checkSetupStatus: () => Promise<SetupStatus>;
    preparePlaylistOutputDir: (payload: PreparePlaylistOutputDirPayload) => Promise<string>;
    prepareChannelOutputDir: (
        payload: PrepareChannelOutputDirPayload
    ) => Promise<PrepareChannelOutputDirResult>;
    resolveEffectiveOutputTemplate: (
        payload: StartDownloadPayload,
        advancedDefaults: ReturnType<typeof normalizeAdvancedDownloadDefaults>
    ) => string;
    commandExists: (command: string) => Promise<boolean>;
    getEffectiveMainLocaleTag: () => string;
    rebuildApplicationMenu: () => void;
}
