import type ElectronStore from 'electron-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDisk } from '../electron/ipc/types';
import * as downloadCapabilities from '../electron/services/downloadCapabilities';
import { DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS } from '../src/types';

const { disk } = vi.hoisted(() => {
    const disk: Record<string, unknown> = {};
    return { disk };
});

vi.mock('electron-store', () => ({
    default: class MockElectronStore {
        constructor(opts: { defaults?: Record<string, unknown> }) {
            Object.assign(disk, structuredClone(opts?.defaults ?? {}));
        }
        get(key: string) {
            return disk[key];
        }
        set(key: string, value: unknown) {
            disk[key] = value;
        }
        delete(key: string) {
            delete disk[key];
        }
    }
}));

vi.mock('../electron/services/proxyProfileStore', () => ({
    DEFAULT_PROXY_PROFILE_ID: 'default',
    isProxyProfileConfigured: () => false
}));

const defaultDisk = {
    outputDir: '/tmp/out',
    maxConcurrentDownloads: 1,
    preferredQuality: 1080,
    uiLocale: ''
};

async function createApi() {
    const Store = (await import('electron-store')).default;
    const { createMainSettingsApi } = await import('../electron/mainSettings');
    const settingsStore = new Store({ defaults: defaultDisk }) as ElectronStore<SettingsDisk>;
    return createMainSettingsApi({
        settingsStore,
        defaultDiskSettings: defaultDisk,
        getHeavyMods: () => ({ caps: downloadCapabilities })
    });
}

describe('createMainSettingsApi.applySettingsPatch', () => {
    beforeEach(() => {
        for (const k of Object.keys(disk)) {
            delete disk[k];
        }
        Object.assign(disk, structuredClone(defaultDisk));
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('persists advancedDownloadDefaults and customFilenameTemplate patches', async () => {
        const api = await createApi();

        const afterAdvanced = api.applySettingsPatch({
            advancedDownloadDefaults: {
                subtitles: { mode: 'embed', languages: ['en', 'fr'] },
                network: { rateLimit: '2M' },
                archive: { enabled: true }
            }
        });
        expect(afterAdvanced.advancedDownloadDefaults.subtitles.mode).toBe('embed');
        expect(afterAdvanced.advancedDownloadDefaults.subtitles.languages).toEqual(['en', 'fr']);
        expect(afterAdvanced.advancedDownloadDefaults.network.rateLimit).toBe('2M');
        expect(afterAdvanced.advancedDownloadDefaults.archive.enabled).toBe(true);

        const afterTemplate = api.applySettingsPatch({
            customFilenameTemplate: '{{channel}} - {{title}}'
        });
        expect(afterTemplate.customFilenameTemplate).toBe('{{channel}} - {{title}}');

        const afterClear = api.applySettingsPatch({ customFilenameTemplate: '' });
        expect(afterClear.customFilenameTemplate).toBeUndefined();
    });

    it('ignores invalid advancedDownloadDefaults patches', async () => {
        const api = await createApi();
        const before = api.getSettings();
        const after = api.applySettingsPatch({ advancedDownloadDefaults: null });
        expect(after.advancedDownloadDefaults).toEqual(before.advancedDownloadDefaults);
        expect(after.advancedDownloadDefaults.subtitles).toEqual(
            DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS.subtitles
        );
    });

    it('rejects relative outputDir patches and heals tampered store values', async () => {
        const api = await createApi();
        const before = api.getSettings().outputDir;
        const afterReject = api.applySettingsPatch({ outputDir: 'relative/out' });
        expect(afterReject.outputDir).toBe(before);

        const absolute = '/tmp/kajo-downloads-safe';
        const afterOk = api.applySettingsPatch({ outputDir: absolute });
        expect(afterOk.outputDir).toBe(absolute);

        disk.outputDir = '../escape';
        expect(api.getSettings().outputDir).toBe('/tmp/out');
        expect(disk.outputDir).toBe('/tmp/out');
    });
});
