import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPC_MAIN_TO_RENDERER } from '../src/shared/ipcChannels';

const desktopRoot = join(import.meta.dirname, '..');
const preloadApiDir = join(desktopRoot, 'electron/preloadApi');
const preloadSource = readdirSync(preloadApiDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(preloadApiDir, f), 'utf8'))
    .join('\n');

function collectMainSourceExcludingPreload(): string {
    const electronRoot = join(desktopRoot, 'electron');
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'preloadApi') {
                    continue;
                }
                walk(full);
                continue;
            }
            if (entry.name.endsWith('.ts')) {
                files.push(readFileSync(full, 'utf8'));
            }
        }
    };
    walk(electronRoot);
    return files.join('\n');
}

const mainSource = collectMainSourceExcludingPreload();

describe('IPC main→renderer parity', () => {
    it('electron/preloadApi references every IPC_MAIN_TO_RENDERER channel', () => {
        for (const key of Object.keys(
            IPC_MAIN_TO_RENDERER
        ) as (keyof typeof IPC_MAIN_TO_RENDERER)[]) {
            const needle = `IPC_MAIN_TO_RENDERER.${String(key)}`;
            expect(
                preloadSource.includes(needle),
                `electron/preloadApi must reference ${needle} (add onChannel / onSignalChannel)`
            ).toBe(true);
        }
    });

    it('main process emit sites reference every IPC_MAIN_TO_RENDERER channel', () => {
        for (const key of Object.keys(
            IPC_MAIN_TO_RENDERER
        ) as (keyof typeof IPC_MAIN_TO_RENDERER)[]) {
            const needle = `IPC_MAIN_TO_RENDERER.${String(key)}`;
            expect(
                mainSource.includes(needle),
                `electron main/services must reference ${needle} when emitting push events`
            ).toBe(true);
        }
    });
});
