import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('kajoElectronStore', () => {
    it('getKajoStoresRoot uses userData when app.getPath exists', async () => {
        vi.resetModules();
        vi.doMock('electron', () => ({
            app: {
                getPath: (name: string) => (name === 'userData' ? '/mock/user-data' : '')
            }
        }));
        const { getKajoStoresRoot } = await import('../electron/lib/kajoElectronStore');
        expect(getKajoStoresRoot()).toBe(join('/mock/user-data', 'kajo-stores'));
    });

    it('getKajoStoresRoot falls back when getPath is missing', async () => {
        vi.resetModules();
        vi.doMock('electron', () => ({ app: {} }));
        const { getKajoStoresRoot } = await import('../electron/lib/kajoElectronStore');
        const root = getKajoStoresRoot();
        expect(root).toContain(join('.kajo-test-user-data', 'kajo-stores'));
    });

    it('createKajoElectronStore uses explicit cwd when provided', async () => {
        vi.resetModules();
        vi.doMock('electron', () => ({
            app: { getPath: () => '/ignored' }
        }));
        const customCwd = mkdtempSync(join(tmpdir(), 'kajo-store-cwd-'));
        const { createKajoElectronStore } = await import('../electron/lib/kajoElectronStore');
        const store = createKajoElectronStore<{ n: number }>({
            name: 'kajo-electron-store-cwd-test',
            cwd: customCwd,
            defaults: { n: 0 }
        });
        expect(store.path.startsWith(customCwd)).toBe(true);
    });
});
