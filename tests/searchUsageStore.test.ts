import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({
    counters: {} as Record<string, number>,
    lastDateKey: ''
}));

vi.mock('../electron/lib/kajoElectronStore', () => ({
    createKajoElectronStore: () => ({
        get: (key: string) => {
            if (key === 'counters') {
                return disk.counters;
            }
            if (key === 'lastDateKey') {
                return disk.lastDateKey;
            }
            return undefined;
        },
        set: (key: string, value: unknown) => {
            if (key === 'counters') {
                disk.counters = { ...(value as Record<string, number>) };
            }
            if (key === 'lastDateKey') {
                disk.lastDateKey = value as string;
            }
        }
    })
}));

describe('searchUsageStore', () => {
    beforeEach(() => {
        disk.counters = {};
        disk.lastDateKey = '';
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-06-10T12:00:00.000Z'));
    });

    afterEach(async () => {
        vi.useRealTimers();
        const m = await import('../electron/services/searchUsageStore');
        m.resetSearchUsageStoreForTests();
        vi.resetModules();
    });

    it('reports zero usage with an unlimited cap before any search', async () => {
        const m = await import('../electron/services/searchUsageStore');
        const u = m.getSearchUsage();
        expect(u.count).toBe(0);
        expect(u.cap).toBe(-1);
        expect(u.dateKey).toBe('2025-06-10');
    });

    it('increments the daily search counter', async () => {
        const m = await import('../electron/services/searchUsageStore');
        m.incrementSearchCount();
        m.incrementSearchCount();
        expect(disk.counters['search:2025-06-10']).toBe(2);
        expect(m.getSearchUsage().count).toBe(2);
    });

    it('resets the counter when the UTC day rolls over', async () => {
        const m = await import('../electron/services/searchUsageStore');
        disk.counters = { 'search:2025-06-09': 9 };
        disk.lastDateKey = '2025-06-09';
        expect(m.getSearchUsage().count).toBe(0);
        expect(disk.lastDateKey).toBe('2025-06-10');
        expect(disk.counters['search:2025-06-09']).toBeUndefined();
    });

    it('skips prune when the day is unchanged', async () => {
        const m = await import('../electron/services/searchUsageStore');
        disk.lastDateKey = '2025-06-10';
        disk.counters = { 'search:2025-06-10': 4 };
        m.incrementSearchCount();
        expect(disk.counters['search:2025-06-10']).toBe(5);
    });

    it('exposes a combined usage snapshot', async () => {
        const m = await import('../electron/services/searchUsageStore');
        m.incrementSearchCount();
        const snap = m.getSearchUsageResponse();
        expect(snap.search.count).toBe(1);
        expect(snap.search.cap).toBe(-1);
    });

    it('resetSearchUsageStoreForTests allows a fresh store on next access', async () => {
        const m = await import('../electron/services/searchUsageStore');
        m.incrementSearchCount();
        expect(m.getSearchUsage().count).toBe(1);
        m.resetSearchUsageStoreForTests();
        disk.counters = {};
        disk.lastDateKey = '';
        expect(m.getSearchUsage().count).toBe(0);
    });
});
