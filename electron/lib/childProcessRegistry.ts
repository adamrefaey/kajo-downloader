/**
 * Central registry of child processes spawned from the Electron main process.
 *
 * Any direct `spawn()` call that runs for more than a handful of milliseconds (yt-dlp
 * metadata probes, version checks, playlist streams, ffmpeg helpers, python setup, …)
 * should register its `ChildProcess` here so it can be forcibly terminated when the
 * user quits the app. Without this, long-running children are left orphaned and
 * keep consuming CPU / memory / network after the Electron process exits.
 *
 * Not used for children spawned inside UtilityProcess workers — those are tracked
 * and killed by their respective workers (see `ytdlpWorker.ts`).
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

type TrackedChild = {
    child: ChildProcess;
    /** True when the child was spawned with `detached: true` (its own process group). */
    detached: boolean;
};

const tracked = new Map<number, TrackedChild>();

function safeKill(pid: number, signal: NodeJS.Signals): void {
    try {
        process.kill(pid, signal);
    } catch {
        // Process may already be dead; ignore.
    }
}

function killProcessTree(pid: number, detached: boolean, signal: NodeJS.Signals): void {
    try {
        if (IS_WIN) {
            const flag = signal === 'SIGKILL' ? '/f' : '';
            spawn('taskkill', ['/pid', String(pid), '/t', flag].filter(Boolean), {
                stdio: 'ignore'
            });
            return;
        }
        if (detached) {
            // Negative PID targets the process group (yt-dlp + ffmpeg, etc.).
            try {
                process.kill(-pid, signal);
                return;
            } catch {
                // Fall through to single-pid kill.
            }
        }
        safeKill(pid, signal);
    } catch {
        safeKill(pid, signal);
    }
}

/**
 * Register a child process so it can be killed when the app quits. The child is
 * automatically de-registered when it emits `close` / `exit` / `error`.
 *
 * Returns the passed-in child so callers can chain: `trackMainChildProcess(spawn(…))`.
 */
export function trackMainChildProcess<T extends ChildProcess>(
    child: T,
    opts: { detached?: boolean } = {}
): T {
    const pid = child.pid;
    if (typeof pid !== 'number' || pid <= 0) {
        return child;
    }
    tracked.set(pid, { child, detached: Boolean(opts.detached) });

    const remove = (): void => {
        tracked.delete(pid);
    };

    // Use `on` (not `once`) for resilience — any of these events means the child is gone.
    const safeOn = (evt: string): void => {
        try {
            child.on(evt, remove);
        } catch {
            // some test doubles don't implement `on`
        }
    };
    safeOn('close');
    safeOn('exit');
    safeOn('error');
    return child;
}

/** How many child processes are currently registered (for diagnostics / tests). */
export function getTrackedMainChildCount(): number {
    return tracked.size;
}

/**
 * Best-effort kill of every tracked child. First sends SIGTERM, then after
 * `forceKillAfterMs` escalates to SIGKILL for anything still alive.
 *
 * Resolves once all children have exited OR the total timeout elapses — whichever
 * comes first. Callers should `await` this during app shutdown to maximise the
 * chance that orphaned yt-dlp/ffmpeg processes are gone before the main process exits.
 */
export async function killAllTrackedMainChildren(
    opts: { forceKillAfterMs?: number; totalTimeoutMs?: number } = {}
): Promise<void> {
    const forceKillAfterMs = opts.forceKillAfterMs ?? 1_200;
    const totalTimeoutMs = opts.totalTimeoutMs ?? 3_000;

    if (tracked.size === 0) {
        return;
    }

    const snapshot = Array.from(tracked.values());

    // Wait for all tracked children to emit `exit`. Tracked entries are removed
    // by the `close`/`exit`/`error` listeners registered in `trackMainChildProcess`.
    const allExited = new Promise<void>((resolve) => {
        const check = (): void => {
            if (tracked.size === 0) {
                resolve();
            }
        };
        for (const { child } of snapshot) {
            try {
                child.once('exit', check);
                child.once('close', check);
                child.once('error', check);
            } catch {
                // ignore — child may have already exited
            }
        }
        // Immediate check in case every child exited before we attached listeners.
        check();
    });

    for (const { child, detached } of snapshot) {
        const pid = child.pid;
        if (typeof pid === 'number' && pid > 0 && !child.killed) {
            killProcessTree(pid, detached, 'SIGTERM');
        }
    }

    const forceTimer = setTimeout(() => {
        for (const { child, detached } of snapshot) {
            const pid = child.pid;
            if (typeof pid === 'number' && pid > 0 && !child.killed) {
                killProcessTree(pid, detached, 'SIGKILL');
            }
        }
    }, forceKillAfterMs);

    const overallTimeout = new Promise<void>((resolve) => {
        setTimeout(resolve, totalTimeoutMs);
    });

    try {
        await Promise.race([allExited, overallTimeout]);
    } finally {
        clearTimeout(forceTimer);
    }
}
