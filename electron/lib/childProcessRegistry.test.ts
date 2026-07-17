import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

type SpawnFn = typeof import('node:child_process').spawn;

const realSpawnRef = vi.hoisted<{ fn: SpawnFn | null }>(() => ({ fn: null }));
const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
    const cp = await importOriginal<typeof import('node:child_process')>();
    realSpawnRef.fn = cp.spawn.bind(cp);
    spawnMock.mockImplementation((...args: Parameters<SpawnFn>) => {
        const fn = realSpawnRef.fn;
        if (!fn) {
            throw new Error('realSpawnRef not initialized');
        }
        return fn(...args);
    });
    return {
        ...cp,
        spawn: (...args: Parameters<SpawnFn>) => spawnMock(...args) as ReturnType<SpawnFn>
    };
});

function createChild(pid?: number, killed = false): ChildProcess {
    const ee = new EventEmitter() as EventEmitter & { pid?: number; killed: boolean };
    if (pid !== undefined) {
        ee.pid = pid;
    }
    ee.killed = killed;
    return ee as unknown as ChildProcess;
}

function stubSpawnReturn(): ReturnType<SpawnFn> {
    return { unref: vi.fn() } as unknown as ReturnType<SpawnFn>;
}

async function loadRegistry(isWin: boolean) {
    vi.resetModules();
    vi.spyOn(process, 'platform', 'get').mockReturnValue(isWin ? 'win32' : 'darwin');
    return import('./childProcessRegistry');
}

afterEach(() => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
    const realSpawn = realSpawnRef.fn;
    if (realSpawn) {
        spawnMock.mockImplementation((...args: Parameters<SpawnFn>) => realSpawn(...args));
    }
    vi.useRealTimers();
});

describe('childProcessRegistry', () => {
    it('returns the child unchanged when pid is missing or non-positive', async () => {
        const { trackMainChildProcess, getTrackedMainChildCount } = await loadRegistry(false);
        const noPid = createChild();
        expect(trackMainChildProcess(noPid)).toBe(noPid);
        expect(getTrackedMainChildCount()).toBe(0);

        const zeroPid = createChild(0);
        expect(trackMainChildProcess(zeroPid)).toBe(zeroPid);
        expect(getTrackedMainChildCount()).toBe(0);
    });

    it('registers a child and clears tracking on exit', async () => {
        const { trackMainChildProcess, getTrackedMainChildCount } = await loadRegistry(false);
        const child = createChild(91001);
        trackMainChildProcess(child);
        expect(getTrackedMainChildCount()).toBe(1);
        child.emit('exit', 0, null);
        expect(getTrackedMainChildCount()).toBe(0);
    });

    it('clears tracking on close and error events', async () => {
        const { trackMainChildProcess, getTrackedMainChildCount } = await loadRegistry(false);
        const a = createChild(91002);
        const b = createChild(91003);
        trackMainChildProcess(a);
        trackMainChildProcess(b);
        expect(getTrackedMainChildCount()).toBe(2);
        a.emit('close', 0, null);
        expect(getTrackedMainChildCount()).toBe(1);
        b.emit('error', new Error('x'));
        expect(getTrackedMainChildCount()).toBe(0);
    });

    it('ignores failures when attaching exit listeners (test doubles)', async () => {
        const { trackMainChildProcess, getTrackedMainChildCount } = await loadRegistry(false);
        const bad = {
            pid: 91004,
            on: () => {
                throw new Error('no on');
            }
        } as unknown as ChildProcess;
        expect(trackMainChildProcess(bad)).toBe(bad);
        expect(getTrackedMainChildCount()).toBe(1);
    });

    it('resolves killAllTrackedMainChildren immediately when nothing is tracked', async () => {
        const { killAllTrackedMainChildren } = await loadRegistry(false);
        await expect(killAllTrackedMainChildren()).resolves.toBeUndefined();
    });

    it('sends SIGTERM via process.kill on non-Windows and resolves when children exit', async () => {
        const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(92001);
        trackMainChildProcess(child);

        const done = killAllTrackedMainChildren({
            forceKillAfterMs: 20_000,
            totalTimeoutMs: 20_000
        });
        await Promise.resolve();
        child.emit('exit', 0, null);
        await done;

        expect(killSpy).toHaveBeenCalledWith(92001, 'SIGTERM');
    });

    it('falls back to single-pid kill when process-group kill fails (detached)', async () => {
        const killSpy = vi
            .spyOn(process, 'kill')
            .mockImplementation((pid: NodeJS.Signals | number) => {
                if (typeof pid === 'number' && pid < 0) {
                    throw Object.assign(new Error('no pg'), { code: 'ESRCH' });
                }
                return true;
            });
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(92002);
        trackMainChildProcess(child, { detached: true });
        const done = killAllTrackedMainChildren({
            forceKillAfterMs: 20_000,
            totalTimeoutMs: 20_000
        });
        await Promise.resolve();
        child.emit('exit', 0, null);
        await done;

        expect(killSpy).toHaveBeenCalledWith(-92002, 'SIGTERM');
        expect(killSpy).toHaveBeenCalledWith(92002, 'SIGTERM');
    });

    it('uses process-group kill when detached and kill succeeds', async () => {
        const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(92003);
        trackMainChildProcess(child, { detached: true });
        const done = killAllTrackedMainChildren({
            forceKillAfterMs: 20_000,
            totalTimeoutMs: 20_000
        });
        await Promise.resolve();
        child.emit('exit', 0, null);
        await done;

        expect(killSpy).toHaveBeenCalledWith(-92003, 'SIGTERM');
    });

    it('ignores listener attach failures inside killAllTrackedMainChildren', async () => {
        vi.useFakeTimers();
        vi.spyOn(process, 'kill').mockReturnValue(true);
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(92004);
        vi.spyOn(child as EventEmitter, 'once').mockImplementation(() => {
            throw new Error('no once');
        });
        trackMainChildProcess(child);
        const p = killAllTrackedMainChildren({ forceKillAfterMs: 5, totalTimeoutMs: 20 });
        await vi.advanceTimersByTimeAsync(20);
        await p;
    });

    it('on Windows uses taskkill without /f for SIGTERM and with /f after force delay for SIGKILL', async () => {
        vi.useFakeTimers();
        spawnMock.mockImplementation(() => stubSpawnReturn());
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(true);
        const child = createChild(93001);
        trackMainChildProcess(child);

        const done = killAllTrackedMainChildren({ forceKillAfterMs: 100, totalTimeoutMs: 5_000 });
        await vi.advanceTimersByTimeAsync(0);
        const termCalls = spawnMock.mock.calls.filter((c) => c[0] === 'taskkill');
        expect(termCalls.length).toBeGreaterThanOrEqual(1);
        expect(termCalls[0]?.[1]).toEqual(['/pid', '93001', '/t']);

        await vi.advanceTimersByTimeAsync(100);
        const killCalls = spawnMock.mock.calls.filter(
            (c) => c[0] === 'taskkill' && (c[1] as string[]).includes('/f')
        );
        expect(killCalls.length).toBeGreaterThanOrEqual(1);

        await vi.advanceTimersByTimeAsync(5_000);
        await done;
    });

    it('on Windows falls back to process.kill when taskkill spawn throws', async () => {
        const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
        spawnMock.mockImplementationOnce(() => {
            throw new Error('spawn failed');
        });
        spawnMock.mockImplementation(() => stubSpawnReturn());

        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(true);
        const child = createChild(93002);
        trackMainChildProcess(child);
        const done = killAllTrackedMainChildren({
            forceKillAfterMs: 20_000,
            totalTimeoutMs: 20_000
        });
        await Promise.resolve();
        child.emit('exit', 0, null);
        await done;

        expect(killSpy).toHaveBeenCalledWith(93002, 'SIGTERM');
    });

    it('safeKill swallows process.kill errors', async () => {
        const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
        killSpy.mockImplementationOnce(() => {
            throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        });

        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(92005);
        trackMainChildProcess(child);
        const done = killAllTrackedMainChildren({
            forceKillAfterMs: 20_000,
            totalTimeoutMs: 20_000
        });
        await Promise.resolve();
        child.emit('exit', 0, null);
        await done;
    });

    it('does not call killProcessTree when child.killed is already true', async () => {
        vi.useFakeTimers();
        const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(94001, true);
        trackMainChildProcess(child);
        const p = killAllTrackedMainChildren({ forceKillAfterMs: 5, totalTimeoutMs: 30 });
        await vi.advanceTimersByTimeAsync(30);
        await p;
        expect(killSpy).not.toHaveBeenCalled();
    });

    it('does not call killProcessTree when pid is invalid at shutdown', async () => {
        vi.useFakeTimers();
        const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(94002);
        trackMainChildProcess(child);
        Object.defineProperty(child, 'pid', { value: undefined, configurable: true });
        const p = killAllTrackedMainChildren({ forceKillAfterMs: 5, totalTimeoutMs: 30 });
        await vi.advanceTimersByTimeAsync(30);
        await p;
        expect(killSpy).not.toHaveBeenCalled();
        child.emit('exit', 0, null);
    });

    it('skips SIGKILL when child is already killed before the force timer', async () => {
        vi.useFakeTimers();
        const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
        const { trackMainChildProcess, killAllTrackedMainChildren } = await loadRegistry(false);
        const child = createChild(94003);
        trackMainChildProcess(child);
        const p = killAllTrackedMainChildren({ forceKillAfterMs: 50, totalTimeoutMs: 200 });
        await vi.advanceTimersByTimeAsync(0);
        expect(killSpy).toHaveBeenCalledWith(94003, 'SIGTERM');
        Object.defineProperty(child, 'killed', { value: true, configurable: true });
        await vi.advanceTimersByTimeAsync(50);
        expect(killSpy.mock.calls.filter((c) => c[1] === 'SIGKILL')).toHaveLength(0);
        Object.defineProperty(child, 'killed', { value: false, configurable: true });
        child.emit('exit', 0, null);
        await vi.advanceTimersByTimeAsync(200);
        await p;
    });
});
