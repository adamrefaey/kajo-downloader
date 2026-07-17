import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_GENERIC_ERROR_KEY, useSearchStore } from '../src/store/searchStore';

function resetSearchStoreSlice(): void {
    useSearchStore.setState({
        query: '',
        results: [],
        visibleCount: 8,
        isSearching: false,
        hasSearched: false,
        usage: null,
        error: null
    });
}

describe('useSearchStore', () => {
    const search = vi.fn();
    const getUsage = vi.fn();

    beforeEach(() => {
        search.mockReset();
        getUsage.mockReset();
        vi.stubGlobal('window', {
            api: {
                search: { search, getUsage }
            }
        });
        resetSearchStoreSlice();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('setQuery updates query', () => {
        useSearchStore.getState().setQuery('hello');
        expect(useSearchStore.getState().query).toBe('hello');
    });

    it('search no-ops when query is too short', async () => {
        useSearchStore.setState({ query: 'a' });
        await useSearchStore.getState().search();
        expect(search).not.toHaveBeenCalled();
    });

    it('search passes youtube platform and resets visibleCount', async () => {
        search.mockResolvedValueOnce({
            ok: true,
            results: Array.from({ length: 16 }, (_, i) => ({ id: String(i) })),
            usage: { count: 1, cap: 30, dateKey: '2026-01-01' }
        });
        useSearchStore.setState({ query: 'lofi beats', visibleCount: 16 });
        await useSearchStore.getState().search();
        expect(search).toHaveBeenCalledWith(expect.objectContaining({ platforms: ['youtube'] }));
        expect(useSearchStore.getState().visibleCount).toBe(8);
        expect(useSearchStore.getState().results).toHaveLength(16);
    });

    it('loadMore increments visibleCount up to results length', () => {
        useSearchStore.setState({
            results: Array.from({ length: 20 }, (_, i) => ({ id: String(i) }) as never),
            visibleCount: 8
        });
        useSearchStore.getState().loadMore();
        expect(useSearchStore.getState().visibleCount).toBe(16);
        useSearchStore.getState().loadMore();
        expect(useSearchStore.getState().visibleCount).toBe(20);
        useSearchStore.getState().loadMore();
        expect(useSearchStore.getState().visibleCount).toBe(20);
    });

    it('search handles null API result', async () => {
        search.mockResolvedValueOnce(null);
        useSearchStore.setState({ query: 'ab' });
        await useSearchStore.getState().search();
        expect(useSearchStore.getState().hasSearched).toBe(true);
        expect(useSearchStore.getState().isSearching).toBe(false);
    });

    it('search handles ok and error results', async () => {
        search.mockResolvedValueOnce({
            ok: true,
            results: [{ id: '1' } as never],
            usage: { count: 1, cap: 10, dateKey: '2026-01-01' }
        });
        useSearchStore.setState({ query: 'cats' });
        await useSearchStore.getState().search();
        expect(useSearchStore.getState().results).toEqual([{ id: '1' }]);
        expect(useSearchStore.getState().usage).toEqual({
            count: 1,
            cap: 10,
            dateKey: '2026-01-01'
        });

        search.mockResolvedValueOnce({
            ok: false,
            error: 'limit',
            usage: { count: 10, cap: 10, dateKey: '2026-01-01' }
        });
        await useSearchStore.getState().search();
        expect(useSearchStore.getState().error).toBe('limit');

        search.mockResolvedValueOnce({ ok: true, results: [] });
        await useSearchStore.getState().search();
        expect(useSearchStore.getState().usage).toBeNull();

        search.mockResolvedValueOnce({ ok: false, error: 'x' });
        await useSearchStore.getState().search();
        expect(useSearchStore.getState().usage).toBeNull();
    });

    it('search catches errors', async () => {
        search.mockRejectedValueOnce(new Error('network'));
        useSearchStore.setState({ query: 'ok' });
        await useSearchStore.getState().search();
        expect(useSearchStore.getState().error).toBe('network');

        search.mockRejectedValueOnce('plain');
        await useSearchStore.getState().search();
        expect(useSearchStore.getState().error).toBe(SEARCH_GENERIC_ERROR_KEY);
    });

    it('loadUsage sets usage when returned', async () => {
        getUsage.mockResolvedValueOnce({
            search: { count: 2, cap: 9, dateKey: 'd' }
        });
        await useSearchStore.getState().loadUsage();
        expect(useSearchStore.getState().usage).toEqual({ count: 2, cap: 9, dateKey: 'd' });
    });

    it('loadUsage ignores null and swallows errors', async () => {
        getUsage.mockResolvedValueOnce(null);
        await useSearchStore.getState().loadUsage();
        expect(useSearchStore.getState().usage).toBeNull();
        getUsage.mockRejectedValueOnce(new Error('x'));
        await expect(useSearchStore.getState().loadUsage()).resolves.toBeUndefined();
    });

    it('clearResults resets slice', () => {
        useSearchStore.setState({
            results: [{ id: '1' } as never],
            hasSearched: true,
            error: 'e',
            visibleCount: 16
        });
        useSearchStore.getState().clearResults();
        expect(useSearchStore.getState().results).toEqual([]);
        expect(useSearchStore.getState().hasSearched).toBe(false);
        expect(useSearchStore.getState().error).toBeNull();
        expect(useSearchStore.getState().visibleCount).toBe(8);
    });
});
