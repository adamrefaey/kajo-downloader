import { join } from 'node:path';
import { app } from 'electron';
import type ElectronStore from 'electron-store';
import type { Options as ElectronStoreOptions } from 'electron-store';
import ResolvedElectronStore from './electronStoreCompat';

/** Single subdirectory under `userData` for persisted JSON stores (backup / migration). */
export function getKajoStoresRoot(): string {
    const userData =
        typeof app?.getPath === 'function'
            ? app.getPath('userData')
            : join(process.cwd(), '.kajo-test-user-data');
    return join(userData, 'kajo-stores');
}

/** Aligns with `electron-store` `Options<T>` (`T extends Record<string, any>`). */
// biome-ignore lint/suspicious/noExplicitAny: mirrors electron-store's `Record<string, any>` bound.
export function createKajoElectronStore<T extends Record<string, any>>(
    options: ElectronStoreOptions<T>
): ElectronStore<T> {
    return new ResolvedElectronStore<T>({
        ...options,
        cwd: options.cwd ?? getKajoStoresRoot()
    });
}
