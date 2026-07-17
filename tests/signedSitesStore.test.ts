/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSignedSiteListRows, useSignedSitesStore } from '../src/store/signedSitesStore';

function validRow(siteKey: string, lastSavedAt: number) {
    return {
        siteKey,
        siteId: siteKey,
        displayName: 'X',
        domainLabel: 'x.com',
        signedInAs: 'a@b.com' as string | null,
        lastSavedAt,
        cookieCount: 1,
        expiresAt: null as number | null,
        cookieHealth: 'healthy' as const
    };
}

describe('signedSitesStore', () => {
    beforeEach(() => {
        localStorage.removeItem('kajo-signed-sites-ui');
        useSignedSitesStore.setState({ entries: [], validatedAtBySiteKey: {} });
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('setEntries sorts by lastSavedAt descending', () => {
        useSignedSitesStore
            .getState()
            .setEntries([validRow('a', 10), validRow('b', 30), validRow('c', 20)]);
        expect(useSignedSitesStore.getState().entries.map((e) => e.siteKey)).toEqual([
            'b',
            'c',
            'a'
        ]);
    });

    it('mergeRow ignores invalid payloads', () => {
        useSignedSitesStore.getState().setEntries([validRow('keep', 1)]);
        useSignedSitesStore.getState().mergeRow({} as never);
        expect(useSignedSitesStore.getState().entries).toHaveLength(1);
    });

    it('mergeRow replaces same siteKey and re-sorts', () => {
        useSignedSitesStore.getState().setEntries([validRow('a', 1), validRow('b', 2)]);
        useSignedSitesStore.getState().mergeRow({ ...validRow('a', 99), displayName: 'Y' });
        const entries = useSignedSitesStore.getState().entries;
        expect(entries[0]?.siteKey).toBe('a');
        expect(entries[0]?.lastSavedAt).toBe(99);
    });

    it('setValidatedAt merges into map', () => {
        useSignedSitesStore.getState().setValidatedAt('yt', 42);
        expect(useSignedSitesStore.getState().validatedAtBySiteKey.yt).toBe(42);
    });

    it('refreshFromMain no-ops without IPC', async () => {
        await useSignedSitesStore.getState().refreshFromMain();
        expect(useSignedSitesStore.getState().entries).toEqual([]);
    });

    it('refreshFromMain hydrates from list() and ignores bad payloads', async () => {
        vi.stubGlobal('window', {
            ...window,
            api: {
                siteAuth: {
                    listSignedSites: vi
                        .fn()
                        .mockResolvedValueOnce([validRow('z', 5), { bad: true }, null])
                }
            }
        });
        await useSignedSitesStore.getState().refreshFromMain();
        expect(useSignedSitesStore.getState().entries.map((e) => e.siteKey)).toEqual(['z']);
    });

    it('refreshFromMain ignores non-array and swallows errors', async () => {
        const list = vi.fn().mockResolvedValueOnce('nope');
        vi.stubGlobal('window', {
            ...window,
            api: { siteAuth: { listSignedSites: list } }
        });
        await useSignedSitesStore.getState().refreshFromMain();
        expect(useSignedSitesStore.getState().entries).toEqual([]);

        list.mockRejectedValueOnce(new Error('ipc'));
        await useSignedSitesStore.getState().refreshFromMain();
    });

    it('validateSite returns false without IPC or on failure', async () => {
        expect(await useSignedSitesStore.getState().validateSite('x')).toBe(false);
        vi.stubGlobal('window', {
            ...window,
            api: {
                siteAuth: {
                    validateSignedSite: vi.fn().mockResolvedValue({ ok: false })
                }
            }
        });
        expect(await useSignedSitesStore.getState().validateSite('x')).toBe(false);
    });

    it('validateSite updates state on success', async () => {
        const row = validRow('ok', 7);
        vi.stubGlobal('window', {
            ...window,
            api: {
                siteAuth: {
                    validateSignedSite: vi.fn().mockResolvedValue({ ok: true, row })
                }
            }
        });
        await expect(useSignedSitesStore.getState().validateSite('ok')).resolves.toBe(true);
        expect(useSignedSitesStore.getState().validatedAtBySiteKey.ok).toBeDefined();
        expect(useSignedSitesStore.getState().entries.some((e) => e.siteKey === 'ok')).toBe(true);
    });

    it('clearSite returns false without IPC or on failure', async () => {
        expect(await useSignedSitesStore.getState().clearSite('x')).toBe(false);
        vi.stubGlobal('window', {
            ...window,
            api: {
                siteAuth: {
                    clearSignedSite: vi.fn().mockResolvedValue({ ok: false })
                }
            }
        });
        expect(await useSignedSitesStore.getState().clearSite('x')).toBe(false);
    });

    it('clearSite removes site on success', async () => {
        useSignedSitesStore.getState().setEntries([validRow('rm', 1)]);
        useSignedSitesStore.getState().setValidatedAt('rm', 9);
        vi.stubGlobal('window', {
            ...window,
            api: {
                siteAuth: {
                    clearSignedSite: vi.fn().mockResolvedValue({ ok: true })
                }
            }
        });
        await expect(useSignedSitesStore.getState().clearSite('rm')).resolves.toBe(true);
        expect(useSignedSitesStore.getState().entries).toEqual([]);
        expect(useSignedSitesStore.getState().validatedAtBySiteKey.rm).toBeUndefined();
    });

    it('rehydrate merge keeps validatedAt map from storage', async () => {
        localStorage.setItem(
            'kajo-signed-sites-ui',
            JSON.stringify({
                state: { validatedAtBySiteKey: { saved: 1000 } },
                version: 0
            })
        );
        await useSignedSitesStore.persist.rehydrate();
        expect(useSignedSitesStore.getState().validatedAtBySiteKey.saved).toBe(1000);
    });

    it('rehydrate merge drops invalid validatedAtBySiteKey shapes', async () => {
        useSignedSitesStore.getState().setValidatedAt('keep', 2);
        localStorage.setItem(
            'kajo-signed-sites-ui',
            JSON.stringify({
                state: { validatedAtBySiteKey: [] },
                version: 0
            })
        );
        await useSignedSitesStore.persist.rehydrate();
        expect(useSignedSitesStore.getState().validatedAtBySiteKey).toEqual({ keep: 2 });
    });

    it('rehydrate merge handles null persisted state', async () => {
        localStorage.setItem(
            'kajo-signed-sites-ui',
            JSON.stringify({
                state: null,
                version: 0
            })
        );
        useSignedSitesStore.getState().setValidatedAt('x', 1);
        await useSignedSitesStore.persist.rehydrate();
        expect(useSignedSitesStore.getState().validatedAtBySiteKey.x).toBe(1);
    });

    it('buildSignedSiteListRows handles edge inputs', () => {
        expect(buildSignedSiteListRows(undefined, undefined)).toEqual([]);
        expect(
            buildSignedSiteListRows([validRow('a', 1)], { a: 3, n: NaN as unknown as number })
        ).toEqual([expect.objectContaining({ siteKey: 'a', lastValidatedAt: 3 })]);
        expect(buildSignedSiteListRows([validRow('noStamp', 1)], {})).toEqual([
            expect.objectContaining({ siteKey: 'noStamp', lastValidatedAt: null })
        ]);
        expect(buildSignedSiteListRows([], [] as unknown as Record<string, number>)).toEqual([]);
    });
});
