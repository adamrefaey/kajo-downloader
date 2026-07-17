import { EventEmitter } from 'node:events';
import { constants } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnCalls: Array<{ command: string; args: string[] }> = [];

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        isReady: () => true,
        getAppPath: () => '/Users/proj/kajo-video-ai',
        getPath: (name: string) => (name === 'userData' ? '/tmp/kajo-ud' : '/tmp')
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
        stat: vi.fn(actual.stat),
        mkdir: vi.fn(async () => {}),
        chmod: vi.fn(async () => {}),
        writeFile: vi.fn(async () => {}),
        copyFile: vi.fn(async () => {})
    };
});

describe('binaries service (bundled + invocation)', () => {
    beforeEach(() => {
        spawnCalls.length = 0;
        vi.resetModules();
    });

    it('hasBundledBinary returns true when bundled yt-dlp is executable and probe succeeds', async () => {
        const { hasBundledBinary } = await import('../electron/services/binaries');
        await expect(hasBundledBinary('yt-dlp')).resolves.toBe(true);
        expect(spawnCalls.length).toBeGreaterThan(0);
    });

    it('resolveBinaryCommand prefers bundled path when present', async () => {
        const { resolveBinaryCommand } = await import('../electron/services/binaries');
        const cmd = await resolveBinaryCommand('yt-dlp');
        expect(cmd).toContain('yt-dlp');
        expect(cmd.includes('/') || cmd === 'yt-dlp.exe').toBe(true);
    });

    it('buildYtDlpInvocation points --js-runtimes at bundled Deno (no node shim)', async () => {
        const { buildYtDlpInvocation } = await import('../electron/services/binaries');
        const inv = await buildYtDlpInvocation(['--version']);
        const idx = inv.args.indexOf('--js-runtimes');
        expect(idx).toBeGreaterThanOrEqual(0);
        const runtimeSpec = inv.args[idx + 1] ?? '';
        expect(runtimeSpec.startsWith('deno:')).toBe(true);
        expect(runtimeSpec).toContain('deno');
        // The Electron-as-Node shim is the bug being removed.
        expect(inv.args.join(' ')).not.toContain('node:');
        expect(inv.env.PATH).toBeTruthy();
        expect(inv.command).toBeTruthy();
    });
});
