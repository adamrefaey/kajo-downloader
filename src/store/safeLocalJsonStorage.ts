import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * Like `createJSONStorage(() => localStorage)` but drops corrupt buckets instead of
 * rejecting hydration (which can leave derived state inconsistent) or surfacing throws.
 */
export function createSafeLocalJsonStorage<S>(): PersistStorage<S> {
    return {
        getItem: (name) => {
            try {
                const raw = localStorage.getItem(name);
                if (raw === null) {
                    return null;
                }
                return JSON.parse(raw) as StorageValue<S>;
            } catch (cause) {
                console.warn('[kajo] Clearing corrupt localStorage key', name, cause);
                try {
                    localStorage.removeItem(name);
                } catch {
                    /* ignore */
                }
                return null;
            }
        },
        setItem: (name, value) => {
            try {
                localStorage.setItem(name, JSON.stringify(value));
            } catch (cause) {
                console.warn('[kajo] Failed to write localStorage key', name, cause);
            }
        },
        removeItem: (name) => {
            localStorage.removeItem(name);
        }
    };
}
