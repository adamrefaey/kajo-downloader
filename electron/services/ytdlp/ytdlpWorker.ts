/**
 * UtilityProcess worker — spawns yt-dlp child processes on behalf of the main process.
 *
 * Receives messages via `process.parentPort` (Electron UtilityProcess API).
 * Sends progress / data back through the same port.
 *
 * Running in a dedicated Node.js process keeps yt-dlp I/O off the main-process event
 * loop and provides process-level isolation.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';

type SpawnMessage = {
    type: 'spawn';
    id: string;
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
};

type KillMessage = {
    type: 'kill';
    id: string;
    signal: string;
};

type ShutdownMessage = {
    type: 'shutdown';
};

type WorkerInMessage = SpawnMessage | KillMessage | ShutdownMessage;

const activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();

const IS_WIN = process.platform === 'win32';

function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    try {
        if (IS_WIN) {
            const flag = signal === 'SIGKILL' ? '/f' : '';
            spawn('taskkill', ['/pid', String(pid), '/t', flag].filter(Boolean), {
                stdio: 'ignore'
            });
        } else {
            // Child is spawned detached on Unix; negative PID targets the process group.
            process.kill(-pid, signal);
        }
    } catch {
        try {
            process.kill(pid, signal);
        } catch {
            // ignore
        }
    }
}

function killAllActiveChildren(): void {
    for (const [, child] of activeProcesses) {
        const pid = child.pid;
        if (!pid || child.killed) continue;
        killProcessTree(pid, 'SIGTERM');
    }
    setTimeout(() => {
        for (const [, child] of activeProcesses) {
            const pid = child.pid;
            if (!pid || child.killed) continue;
            killProcessTree(pid, 'SIGKILL');
        }
    }, 1200);
}

let shutdownRequested = false;
function requestShutdown(): void {
    if (shutdownRequested) return;
    shutdownRequested = true;
    killAllActiveChildren();
    // Allow a brief window for signal delivery before the worker exits.
    setTimeout(() => {
        try {
            process.exit(0);
        } catch {
            // ignore
        }
    }, 1500);
}

process.on('SIGTERM', requestShutdown);
process.on('SIGINT', requestShutdown);
process.on('beforeExit', () => {
    killAllActiveChildren();
});
process.on('exit', () => {
    killAllActiveChildren();
});

process.parentPort.on('message', (evt: Electron.MessageEvent) => {
    const msg = evt.data as WorkerInMessage;
    switch (msg.type) {
        case 'spawn':
            handleSpawn(msg);
            break;
        case 'kill':
            handleKill(msg);
            break;
        case 'shutdown':
            requestShutdown();
            break;
    }
});

function detachAndKillExisting(id: string): void {
    const existing = activeProcesses.get(id);
    if (!existing || existing.killed) {
        return;
    }
    activeProcesses.delete(id);
    existing.removeAllListeners();
    const pid = existing.pid;
    if (!pid) {
        try {
            existing.kill('SIGTERM');
        } catch {
            // ignore
        }
        return;
    }
    killProcessTree(pid, 'SIGTERM');
}

function handleSpawn(msg: SpawnMessage): void {
    detachAndKillExisting(msg.id);

    const child = spawn(msg.command, msg.args, {
        stdio: 'pipe',
        env: msg.env,
        // Create a new process group on Unix so the main process can send signals to the
        // entire group (yt-dlp + ffmpeg children) via `process.kill(-pid, signal)`.
        detached: process.platform !== 'win32'
    }) as ChildProcessWithoutNullStreams;

    activeProcesses.set(msg.id, child);
    process.parentPort.postMessage({ type: 'pid', id: msg.id, pid: child.pid });

    child.stdout.on('data', (chunk: Buffer) => {
        process.parentPort.postMessage({
            type: 'stdout',
            id: msg.id,
            chunk: chunk.toString('base64')
        });
    });

    child.stderr.on('data', (chunk: Buffer) => {
        process.parentPort.postMessage({
            type: 'stderr',
            id: msg.id,
            chunk: chunk.toString('base64')
        });
    });

    child.on('error', (err: Error) => {
        process.parentPort.postMessage({ type: 'error', id: msg.id, message: err.message });
        if (activeProcesses.get(msg.id) === child) {
            activeProcesses.delete(msg.id);
        }
    });

    child.on('close', (exitCode: number | null) => {
        process.parentPort.postMessage({ type: 'close', id: msg.id, exitCode });
        if (activeProcesses.get(msg.id) === child) {
            activeProcesses.delete(msg.id);
        }
    });
}

function handleKill(msg: KillMessage): void {
    const child = activeProcesses.get(msg.id);
    if (!child || child.killed) {
        return;
    }
    const pid = child.pid;
    const signal = msg.signal as NodeJS.Signals;
    // SIGSTOP/SIGCONT are used for backpressure on a single process — don't propagate to
    // the whole group, or ffmpeg's output drainer will be suspended along with yt-dlp.
    if (!pid || signal === 'SIGSTOP' || signal === 'SIGCONT') {
        try {
            child.kill(signal);
        } catch {
            // ignore
        }
        return;
    }
    // Kill the entire process group (yt-dlp + ffmpeg children). Falls back to a single-pid
    // kill if the group kill fails (e.g. child not actually detached on some platform).
    killProcessTree(pid, signal);
}
