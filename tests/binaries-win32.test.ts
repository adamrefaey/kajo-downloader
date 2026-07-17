import { EventEmitter } from 'node:events';
import { constants } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnCalls: Array<{ command: string; args: string[] }> = [];

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        isReady: () => true,
        getAppPath: () => 'C:\\\\proj\\\\kajo',
        getPath: (name: string) =>
            name === 'userData' ? 'C:\\\\Users\\\\x\\\\AppData' : 'C:\\\\tmp'
    }
}));

vi.mock('node:child_process', () => ({
    spawn: vi.fn((command: string, args: string[]) => {
        spawnCalls.push({ command, args });
        const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        queueMicrotask(() => {
            child.emit('close', 0);
        });
        return child;
    })
}));

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...actual,
        readdir: vi.fn(async () => []),
        access: vi.fn(async (_p: string, mode?: number) => {
            if (mode === constants.X_OK || mode === undefined) {
                return;
            }
            throw new Error('no access');
        }),
        mkdir: vi.fn(async () => {}),
        chmod: vi.fn(async () => {}),
        writeFile: vi.fn(async () => {})
    };
});

describe('binaries on win32', () => {
    const platform = process.platform;

    beforeEach(() => {
        spawnCalls.length = 0;
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
        Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
        Object.defineProperty(process, 'execPath', {
            value: 'C:\\\\Program Files\\\\Kajo\\\\Kajo.exe',
            configurable: true
        });
        vi.resetModules();
    });

    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    });

    it('buildYtDlpInvocation points at bundled deno.exe and uses win32 executable names', async () => {
        const { buildYtDlpInvocation, getBundledBinaryPath } = await import(
            '../electron/services/binaries'
        );
        expect(getBundledBinaryPath('yt-dlp')).toContain('yt-dlp.exe');
        const inv = await buildYtDlpInvocation(['--version']);
        const joined = inv.args.join(' ');
        expect(joined).toContain('--js-runtimes');
        expect(joined).toContain('deno.exe');
        expect(joined).not.toContain('node.cmd');
    });
});
