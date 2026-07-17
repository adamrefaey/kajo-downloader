import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPC_INVOKE } from '../src/shared/ipcChannels';

const desktopRoot = join(import.meta.dirname, '..');
const preloadApiDir = join(desktopRoot, 'electron/preloadApi');
const preloadSource = readdirSync(preloadApiDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(preloadApiDir, f), 'utf8'))
    .join('\n');

describe('IPC preload parity', () => {
    it('electron/preloadApi references every IPC_INVOKE channel (no orphan channels)', () => {
        for (const key of Object.keys(IPC_INVOKE) as (keyof typeof IPC_INVOKE)[]) {
            const needle = `IPC_INVOKE.${String(key)}`;
            expect(
                preloadSource.includes(needle),
                `electron/preloadApi must reference ${needle} (add wrapInvoke or ipcRenderer.invoke)`
            ).toBe(true);
        }
    });
});
