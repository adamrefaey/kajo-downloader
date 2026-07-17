/**
 * ElectronStore-backed daily counter for in-app search usage. Search is unlimited
 * in the free downloader; the per-day count is tracked for display only.
 */

import type ElectronStore from 'electron-store';
import type { SearchUsage, SearchUsageResponse } from '../../src/shared/searchQuota';
import { SEARCH_DAILY_CAP } from '../../src/shared/searchQuota';
import { createKajoElectronStore } from '../lib/kajoElectronStore';

export type { SearchUsage, SearchUsageResponse };

interface SearchUsageDisk {
    /** Per-day search counters keyed as `search:${dateKey}`. */
    counters: Record<string, number>;
    lastDateKey: string;
}

let store: ElectronStore<SearchUsageDisk> | null = null;

function es(): ElectronStore<SearchUsageDisk> {
    if (!store) {
        store = createKajoElectronStore<SearchUsageDisk>({
            name: 'search-usage',
            defaults: { counters: {}, lastDateKey: '' }
        });
    }
    return store;
}

function utcDateKey(d = new Date()): string {
    return d.toISOString().slice(0, 10);
}

function counterKey(dateKey: string): string {
    return `search:${dateKey}`;
}

/** Drop stale rows when the UTC day rolls over (only today's count is tracked). */
function pruneIfDayRolled(dateKey: string): void {
    const s = es();
    if (s.get('lastDateKey') === dateKey) {
        return;
    }
    s.set('counters', {});
    s.set('lastDateKey', dateKey);
}

export function getSearchUsage(): SearchUsage {
    const dateKey = utcDateKey();
    pruneIfDayRolled(dateKey);
    const count = es().get('counters')[counterKey(dateKey)] ?? 0;
    return { count, cap: SEARCH_DAILY_CAP, dateKey };
}

export function getSearchUsageResponse(): SearchUsageResponse {
    return { search: getSearchUsage() };
}

export function incrementSearchCount(): void {
    const dateKey = utcDateKey();
    pruneIfDayRolled(dateKey);
    const s = es();
    const key = counterKey(dateKey);
    const counters = s.get('counters');
    counters[key] = (counters[key] ?? 0) + 1;
    s.set('counters', counters);
}

/** Reset store for testing. */
export function resetSearchUsageStoreForTests(): void {
    store = null;
}
