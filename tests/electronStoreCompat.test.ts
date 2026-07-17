import { describe, expect, it, vi } from 'vitest';

vi.mock('electron-store', () => {
    class FakeElectronStore {
        private data: Record<string, unknown>;
        constructor(opts?: { defaults?: Record<string, unknown> }) {
            this.data = { ...(opts?.defaults ?? {}) };
        }
        get(key: string): unknown {
            return this.data[key];
        }
        set(key: string, value: unknown): void {
            this.data[key] = value;
        }
        delete(key: string): void {
            delete this.data[key];
        }
        has(key: string): boolean {
            return key in this.data;
        }
    }
    return { default: FakeElectronStore };
});

describe('electronStoreCompat', () => {
    it('exports a constructor function', async () => {
        const { default: ResolvedElectronStore } = await import(
            '../electron/lib/electronStoreCompat'
        );
        expect(typeof ResolvedElectronStore).toBe('function');
    });

    it('can be instantiated with defaults', async () => {
        const { default: ResolvedElectronStore } = await import(
            '../electron/lib/electronStoreCompat'
        );
        const store = new ResolvedElectronStore({ defaults: { foo: 'bar' } });
        expect(store).toBeDefined();
        expect(typeof store.get).toBe('function');
        expect(typeof store.set).toBe('function');
    });

    it('get and set work correctly', async () => {
        const { default: ResolvedElectronStore } = await import(
            '../electron/lib/electronStoreCompat'
        );
        const store = new ResolvedElectronStore({ defaults: { count: 0 } });
        expect(store.get('count')).toBe(0);
        store.set('count', 42);
        expect(store.get('count')).toBe(42);
    });

    it('resolves correctly when default export is nested (CJS interop)', async () => {
        // The mock already exercises the `.default` path because the mock
        // returns `{ default: FakeElectronStore }`, which is exactly the
        // CJS-wrapped shape that the compat module handles.
        const { default: ResolvedElectronStore } = await import(
            '../electron/lib/electronStoreCompat'
        );
        const store = new ResolvedElectronStore({ defaults: { key: 'value' } });
        expect(store.get('key')).toBe('value');
    });
});
