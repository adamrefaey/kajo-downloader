import type { UseBoundStore } from 'zustand';
import { create } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { RendererPlatform } from '../renderer/src/app/controller/rendererPlatform';

export interface PlatformStoreState {
    platform: RendererPlatform;
    setPlatform: (platform: RendererPlatform) => void;
}

const _platformStore: UseBoundStore<StoreApi<PlatformStoreState>> = create<PlatformStoreState>(
    (set) => ({
        platform: 'unknown',
        setPlatform: (platform) => set({ platform })
    })
);
export const usePlatformStore: typeof _platformStore = _platformStore;
