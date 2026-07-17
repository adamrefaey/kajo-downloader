import type { SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_YTDLP_VERSION } from '../src/shared/ytdlpVersionPolicy';

const spawnMock = vi.hoisted(() => vi.fn());
const buildYtDlpInvocationMock = vi.hoisted(() =>
    vi.fn(async (_args: string[]) => ({
        command: 'mock-bin',
        args: ['--version'],
        env: process.env as NodeJS.ProcessEnv
    }))
);

vi.mock('node:child_process', () => ({
    spawn: (command: string, args?: readonly string[], options?: SpawnOptions) =>
        spawnMock(command, args, options)
}));

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: (args: string[]) => buildYtDlpInvocationMock(args)
}));

function childWithClose(stdout: string, code: number, stderr = '') {
    const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill?: (signal: NodeJS.Signals) => void;
    };
    child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: () => {}
    });
    child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: () => {}
    });
    queueMicrotask(() => {
        if (stdout) {
            child.stdout.emit('data', Buffer.from(stdout, 'utf8'));
        }
        if (stderr) {
            child.stderr.emit('data', Buffer.from(stderr, 'utf8'));
        }
        child.emit('close', code);
    });
    return child;
}

describe('ytdlpVersionProbe', () => {
    beforeEach(() => {
        buildYtDlpInvocationMock.mockImplementation(async () => ({
            command: 'mock-bin',
            args: ['--version'],
            env: process.env as NodeJS.ProcessEnv
        }));
    });

    afterEach(() => {
        spawnMock.mockReset();
        buildYtDlpInvocationMock.mockReset();
        buildYtDlpInvocationMock.mockImplementation(async () => ({
            command: 'mock-bin',
            args: ['--version'],
            env: process.env as NodeJS.ProcessEnv
        }));
        vi.resetModules();
        vi.useRealTimers();
    });

    it('getMinimumYtDlpVersion matches shared policy floor', async () => {
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(probe.getMinimumYtDlpVersion()).toBe(MIN_YTDLP_VERSION);
    });

    it('ytDlpReportedVersionSatisfiesMinimum treats null as acceptable (unknown)', async () => {
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(probe.ytDlpReportedVersionSatisfiesMinimum(null)).toBe(true);
    });

    it('ytDlpReportedVersionSatisfiesMinimum is false when below minimum', async () => {
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(probe.ytDlpReportedVersionSatisfiesMinimum('2024.01.01')).toBe(false);
    });

    it('ytDlpReportedVersionSatisfiesMinimum is true at and above minimum', async () => {
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(probe.ytDlpReportedVersionSatisfiesMinimum(MIN_YTDLP_VERSION)).toBe(true);
        expect(probe.ytDlpReportedVersionSatisfiesMinimum('2099.12.31')).toBe(true);
    });

    it('probes version, caches within TTL, and bypasses cache with forceRefresh', async () => {
        let calls = 0;
        spawnMock.mockImplementation(() => {
            calls += 1;
            return childWithClose(`${MIN_YTDLP_VERSION}\n`, 0);
        });
        const probe = await import('../electron/services/ytdlpVersionProbe');
        const v1 = await probe.probeYtDlpVersion(true);
        expect(v1).toBe(MIN_YTDLP_VERSION);
        const v2 = await probe.probeYtDlpVersion(false);
        expect(v2).toBe(v1);
        expect(calls).toBe(1);
        await probe.probeYtDlpVersion(true);
        expect(calls).toBe(2);
    });

    it('re-probes after cache TTL without forceRefresh', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        let calls = 0;
        spawnMock.mockImplementation(() => {
            calls += 1;
            return childWithClose(`${MIN_YTDLP_VERSION}\n`, 0);
        });
        const probe = await import('../electron/services/ytdlpVersionProbe');
        await probe.probeYtDlpVersion(true);
        expect(calls).toBe(1);
        await probe.probeYtDlpVersion(false);
        expect(calls).toBe(1);
        vi.setSystemTime(new Date('2026-01-01T00:02:01.000Z'));
        await probe.probeYtDlpVersion(false);
        expect(calls).toBe(2);
    });

    it('returns null on spawn error', async () => {
        spawnMock.mockImplementationOnce(() => {
            const e = new EventEmitter() as NodeJS.EventEmitter & {
                stdout: EventEmitter;
                stderr: EventEmitter;
            };
            e.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            e.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            queueMicrotask(() => e.emit('error', new Error('spawn fail')));
            return e;
        });
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(await probe.probeYtDlpVersion(true)).toBeNull();
    });

    it('returns null when --version exits non-zero', async () => {
        spawnMock.mockImplementation(() => childWithClose('', 1, 'err'));
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(await probe.probeYtDlpVersion(true)).toBeNull();
    });

    it('returns null when output has no parseable calver', async () => {
        spawnMock.mockImplementation(() => childWithClose('no version here\n', 0));
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(await probe.probeYtDlpVersion(true)).toBeNull();
    });

    it('returns null on empty stdout with exit 0', async () => {
        spawnMock.mockImplementation(() => childWithClose('', 0));
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(await probe.probeYtDlpVersion(true)).toBeNull();
    });

    it('parses calver from stderr when stdout is empty', async () => {
        spawnMock.mockImplementation(() => childWithClose('', 0, `${MIN_YTDLP_VERSION}\n`));
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(await probe.probeYtDlpVersion(true)).toBe(MIN_YTDLP_VERSION);
    });

    it('returns null when buildYtDlpInvocation rejects', async () => {
        buildYtDlpInvocationMock.mockRejectedValueOnce(new Error('no bundled binary'));
        const probe = await import('../electron/services/ytdlpVersionProbe');
        expect(await probe.probeYtDlpVersion(true)).toBeNull();
        expect(spawnMock).not.toHaveBeenCalled();
    });

    it('returns null when probe times out and sends SIGKILL', async () => {
        vi.useFakeTimers();
        const killMock = vi.fn();
        spawnMock.mockImplementation(() => {
            const child = new EventEmitter() as NodeJS.EventEmitter & {
                stdout: EventEmitter;
                stderr: EventEmitter;
                kill: (signal: NodeJS.Signals) => void;
            };
            child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            child.kill = killMock;
            return child;
        });
        const probe = await import('../electron/services/ytdlpVersionProbe');
        const p = probe.probeYtDlpVersion(true);
        await vi.advanceTimersByTimeAsync(10_000);
        await expect(p).resolves.toBeNull();
        expect(killMock).toHaveBeenCalledWith('SIGKILL');
    });

    it('still times out when kill throws inside timer', async () => {
        vi.useFakeTimers();
        spawnMock.mockImplementation(() => {
            const child = new EventEmitter() as NodeJS.EventEmitter & {
                stdout: EventEmitter;
                stderr: EventEmitter;
                kill: () => void;
            };
            child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            child.kill = () => {
                throw new Error('kill failed');
            };
            return child;
        });
        const probe = await import('../electron/services/ytdlpVersionProbe');
        const p = probe.probeYtDlpVersion(true);
        await vi.advanceTimersByTimeAsync(10_000);
        await expect(p).resolves.toBeNull();
    });
});
