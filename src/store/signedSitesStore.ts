import type { UseBoundStore } from 'zustand';
import { create } from 'zustand';
import type { PersistOptions } from 'zustand/middleware';
import { persist } from 'zustand/middleware';
import type { StoreApi } from 'zustand/vanilla';
import { isSignedSiteSummary } from '../shared/signedSiteSummaryGuard';
import type { SignedSiteSummary } from '../types';
import { createSafeLocalJsonStorage } from './safeLocalJsonStorage';

export type SignedSiteListRow = SignedSiteSummary & { lastValidatedAt: number | null };

function sortEntries(rows: SignedSiteSummary[]): SignedSiteSummary[] {
    return [...rows].sort((a, b) => b.lastSavedAt - a.lastSavedAt);
}

function mergeSignedSitesPersisted(
    persisted: unknown,
    current: SignedSitesState
): SignedSitesState {
    if (!persisted || typeof persisted !== 'object') {
        return current;
    }
    const raw = (persisted as { validatedAtBySiteKey?: unknown }).validatedAtBySiteKey;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return current;
    }
    const validatedAtBySiteKey = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).filter(
            ([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v)
        )
    ) as Record<string, number>;
    return { ...current, validatedAtBySiteKey };
}

interface SignedSitesState {
    entries: SignedSiteSummary[];
    validatedAtBySiteKey: Record<string, number>;
    setEntries: (rows: SignedSiteSummary[]) => void;
    mergeRow: (row: SignedSiteSummary) => void;
    setValidatedAt: (siteKey: string, at: number) => void;
    refreshFromMain: () => Promise<void>;
    validateSite: (siteKey: string) => Promise<boolean>;
    clearSite: (siteKey: string) => Promise<boolean>;
}

type UseSignedSitesStoreType = UseBoundStore<StoreApi<SignedSitesState>> & {
    persist: {
        clearStorage(): void;
        rehydrate(): Promise<void> | void;
        hasHydrated(): boolean;
        onHydrate(fn: (state: SignedSitesState) => void): () => void;
        onFinishHydration(fn: (state: SignedSitesState) => void): () => void;
        setOptions(opts: Partial<PersistOptions<SignedSitesState>>): void;
    };
};

const _signedSitesStore: UseSignedSitesStoreType = create(
    persist<SignedSitesState>(
        (set, get) => ({
            entries: [],
            validatedAtBySiteKey: {},
            setEntries: (rows) => set({ entries: sortEntries(rows) }),
            mergeRow: (row) => {
                if (!isSignedSiteSummary(row)) {
                    return;
                }
                set((s) => {
                    const without = s.entries.filter((e) => e.siteKey !== row.siteKey);
                    return { entries: sortEntries([...without, row]) };
                });
            },
            setValidatedAt: (siteKey, at) =>
                set((s) => ({
                    validatedAtBySiteKey: { ...s.validatedAtBySiteKey, [siteKey]: at }
                })),
            refreshFromMain: async () => {
                const list = window.api?.siteAuth?.listSignedSites;
                if (!list) {
                    return;
                }
                try {
                    const rows = await list();
                    if (!Array.isArray(rows)) {
                        return;
                    }
                    const clean = rows.filter(isSignedSiteSummary);
                    set({ entries: sortEntries(clean) });
                } catch {
                    /* ignore IPC failures; avoid blank-screen crashes from bad payloads */
                }
            },
            validateSite: async (siteKey) => {
                const fn = window.api?.siteAuth?.validateSignedSite;
                if (!fn) {
                    return false;
                }
                const r = await fn(siteKey);
                if (!r.ok) {
                    return false;
                }
                const at = Date.now();
                get().setValidatedAt(siteKey, at);
                get().mergeRow(r.row);
                return true;
            },
            clearSite: async (siteKey) => {
                const fn = window.api?.siteAuth?.clearSignedSite;
                if (!fn) {
                    return false;
                }
                const r = await fn(siteKey);
                if (!r.ok) {
                    return false;
                }
                set((s) => {
                    const nextVal = { ...s.validatedAtBySiteKey };
                    delete nextVal[siteKey];
                    return {
                        entries: s.entries.filter((e) => e.siteKey !== siteKey),
                        validatedAtBySiteKey: nextVal
                    };
                });
                return true;
            }
        }),
        {
            name: 'kajo-signed-sites-ui',
            storage: createSafeLocalJsonStorage(),
            merge: mergeSignedSitesPersisted,
            // zustand@5 typings expect a full `SignedSitesState` return; we only persist validation stamps.
            partialize: (state) =>
                ({
                    validatedAtBySiteKey: state.validatedAtBySiteKey
                }) as unknown as SignedSitesState
        }
    )
);
export const useSignedSitesStore: UseSignedSitesStoreType = _signedSitesStore;

/** Derive UI rows from store slices (new array each call). Memoize at the call site only if referential stability matters. */
export function buildSignedSiteListRows(
    entries: SignedSiteSummary[] | undefined,
    validatedAtBySiteKey: Record<string, number> | undefined
): SignedSiteListRow[] {
    const list = Array.isArray(entries) ? entries : [];
    const map =
        validatedAtBySiteKey &&
        typeof validatedAtBySiteKey === 'object' &&
        !Array.isArray(validatedAtBySiteKey)
            ? validatedAtBySiteKey
            : {};
    return list.filter(isSignedSiteSummary).map((r) => ({
        ...r,
        lastValidatedAt: map[r.siteKey] ?? null
    }));
}
