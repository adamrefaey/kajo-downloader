import type { UseBoundStore } from 'zustand';
import { create } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { SearchResultRow, SearchUsage } from '../types';

const PAGE_SIZE = 8;
const FETCH_SIZE = 24;

/** Store sentinel — translate with `search.failed` in the renderer. */
export const SEARCH_GENERIC_ERROR_KEY = 'search.failed';

export interface SearchStoreState {
    query: string;
    results: SearchResultRow[];
    visibleCount: number;
    isSearching: boolean;
    hasSearched: boolean;
    usage: SearchUsage | null;
    error: string | null;

    setQuery: (q: string) => void;
    search: () => Promise<void>;
    loadMore: () => void;
    loadUsage: () => Promise<void>;
    clearResults: () => void;
}

const _searchStore: UseBoundStore<StoreApi<SearchStoreState>> = create<SearchStoreState>(
    (set, get) => ({
        query: '',
        results: [],
        visibleCount: PAGE_SIZE,
        isSearching: false,
        hasSearched: false,
        usage: null,
        error: null,

        setQuery: (q) => set({ query: q }),

        loadMore: () => {
            const { visibleCount, results } = get();
            set({ visibleCount: Math.min(visibleCount + PAGE_SIZE, results.length) });
        },

        search: async () => {
            const { query } = get();
            if (query.trim().length < 2) {
                return;
            }
            set({ isSearching: true, error: null, visibleCount: PAGE_SIZE });
            try {
                const result = await window.api?.search?.search?.({
                    query: query.trim(),
                    platforms: ['youtube'],
                    maxResults: FETCH_SIZE
                });
                if (!result) {
                    set({ isSearching: false, hasSearched: true });
                    return;
                }
                if (result.ok) {
                    set({
                        results: result.results,
                        usage: result.usage ?? null,
                        isSearching: false,
                        hasSearched: true
                    });
                } else {
                    set({
                        error: result.error,
                        usage: result.usage ?? null,
                        isSearching: false,
                        hasSearched: true
                    });
                }
            } catch (err) {
                set({
                    error: err instanceof Error ? err.message : SEARCH_GENERIC_ERROR_KEY,
                    isSearching: false,
                    hasSearched: true
                });
            }
        },

        loadUsage: async () => {
            try {
                const bundle = await window.api?.search?.getUsage?.();
                if (bundle) {
                    set({ usage: bundle.search });
                }
            } catch {
                // Non-critical — usage display is best-effort
            }
        },

        clearResults: () =>
            set({ results: [], hasSearched: false, error: null, visibleCount: PAGE_SIZE })
    })
);
export const useSearchStore: typeof _searchStore = _searchStore;
