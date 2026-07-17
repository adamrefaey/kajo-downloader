import { describe, expect, it } from 'vitest';
import { useSetupStore } from '../src/store/setupStore';

describe('useSetupStore', () => {
    it('toggles checking/install flags and replaces setup status', () => {
        useSetupStore.setState({
            isCheckingSetup: true,
            setupStatus: null,
            isInstallingYtdlp: false,
            setupLogs: []
        });
        useSetupStore.getState().setIsCheckingSetup(false);
        expect(useSetupStore.getState().isCheckingSetup).toBe(false);
        const status = {
            ytdlpInstalled: true,
            ffmpegInstalled: true,
            homebrewInstalled: false,
            ytdlpVersion: '2024',
            ytdlpMeetsMinimumVersion: true,
            ytdlpReady: true
        };
        useSetupStore.getState().setSetupStatus(status);
        expect(useSetupStore.getState().setupStatus).toEqual(status);
        useSetupStore
            .getState()
            .setSetupStatus((prev) => (prev ? { ...prev, ytdlpReady: false } : null));
        expect(useSetupStore.getState().setupStatus?.ytdlpReady).toBe(false);
        useSetupStore.getState().setIsInstallingYtdlp(true);
        expect(useSetupStore.getState().isInstallingYtdlp).toBe(true);
    });

    it('appendSetupLogLines caps length and clearSetupLogs empties', () => {
        useSetupStore.setState({ setupLogs: [] });
        const long = Array.from({ length: 400 }, (_, i) => `L${i}`);
        useSetupStore.getState().appendSetupLogLines(long);
        expect(useSetupStore.getState().setupLogs.length).toBe(300);
        expect(useSetupStore.getState().setupLogs[0]).toBe('L100');
        useSetupStore.getState().clearSetupLogs();
        expect(useSetupStore.getState().setupLogs).toEqual([]);
    });
});
