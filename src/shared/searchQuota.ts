/**
 * In-app YouTube search usage. The free downloader never caps search
 * (cap = -1, unlimited); the per-day count is tracked for display only.
 */

export interface SearchUsage {
    count: number;
    /** -1 = unlimited. */
    cap: number;
    /** UTC day `YYYY-MM-DD`. */
    dateKey: string;
}

/** Full usage snapshot for preload (`search.getUsage`). */
export interface SearchUsageResponse {
    search: SearchUsage;
}

/** The free downloader never caps search. */
export const SEARCH_DAILY_CAP = -1;
