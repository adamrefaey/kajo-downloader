import type { UseBoundStore } from 'zustand';
import { create } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { SetupStatus } from '../types';

const MAX_SETUP_LOG_LINES = 300;

export interface SetupStoreState {
    isCheckingSetup: boolean;
    setupStatus: SetupStatus | null;
    isInstallingYtdlp: boolean;
    setupLogs: string[];
    setIsCheckingSetup: (v: boolean) => void;
    setSetupStatus: (
        next: SetupStatus | null | ((prev: SetupStatus | null) => SetupStatus | null)
    ) => void;
    setIsInstallingYtdlp: (v: boolean) => void;
    appendSetupLogLines: (lines: string[]) => void;
    clearSetupLogs: () => void;
}

const _setupStore: UseBoundStore<StoreApi<SetupStoreState>> = create<SetupStoreState>((set) => ({
    isCheckingSetup: true,
    setupStatus: null,
    isInstallingYtdlp: false,
    setupLogs: [],
    setIsCheckingSetup: (isCheckingSetup) => set({ isCheckingSetup }),
    setSetupStatus: (next) =>
        set((state) => ({
            setupStatus: typeof next === 'function' ? next(state.setupStatus) : next
        })),
    setIsInstallingYtdlp: (isInstallingYtdlp) => set({ isInstallingYtdlp }),
    appendSetupLogLines: (lines) =>
        set((state) => ({
            setupLogs: [...state.setupLogs, ...lines].slice(-MAX_SETUP_LOG_LINES)
        })),
    clearSetupLogs: () => set({ setupLogs: [] })
}));
export const useSetupStore: typeof _setupStore = _setupStore;
