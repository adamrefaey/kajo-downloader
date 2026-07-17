/**
 * Main-process bridge to the yt-dlp UtilityProcess worker.
 *
 * Exposes `spawnYtdlpProcess` which returns a `YtdlpProcessHandle` that emits the same
 * events as a `ChildProcess` (stdout/stderr streams, 'close', 'error'). All yt-dlp
 * invocations are routed through a single persistent worker process, keeping yt-dlp I/O
 * off the Electron main-process event loop.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { utilityProcess } from 'electron';
import { electronUserDataPath } from '../../lib/electronProcessContext';
import ytdlpWorkerPath from './ytdlpWorker?modulePath';

type WorkerOutMessage =
    | { type: 'pid'; id: string; pid: number }
    | { type: 'stdout'; id: string; chunk: string }
    | { type: 'stderr'; id: string; chunk: string }
    | { type: 'close'; id: string; exitCode: number | null }
    | { type: 'error'; id: string; message: string };

type WorkerInMessage =
    | { type: 'spawn'; id: string; command: string; args: string[]; env: NodeJS.ProcessEnv }
    | { type: 'kill'; id: string; signal: string }
    | { type: 'shutdown' };

/** Minimal interface satisfied by both the UtilityProcess handle and a plain ChildProcess. */
export interface ManagedProcess extends NodeJS.EventEmitter {
    readonly pid: number | undefined;
    readonly killed: boolean;
    kill(signal?: NodeJS.Signals | string | number): boolean;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
}

/** Error surfaced when the shared worker dies before a job completes normally. */
export const YTDLP_WORKER_UNEXPECTED_EXIT_ERROR = 'yt-dlp worker process exited unexpectedly';

/** Error surfaced when the shared worker is torn down during app quit. */
export const YTDLP_WORKER_SHUTDOWN_ERROR = 'yt-dlp worker process shut down';

/** Handle returned by {@link spawnYtdlpProcess} — routes I/O through the shared worker. */
export class YtdlpProcessHandle extends EventEmitter implements ManagedProcess {
    readonly stdout: PassThrough;
    readonly stderr: PassThrough;
    private _pid: number | undefined;
    private _killed = false;
    private readonly _id: string;
    private readonly _send: (msg: WorkerInMessage) => void;

    constructor(id: string, send: (msg: WorkerInMessage) => void) {
        super();
        this._id = id;
        this._send = send;
        this.stdout = new PassThrough();
        this.stderr = new PassThrough();
    }

    get pid(): number | undefined {
        return this._pid;
    }

    get killed(): boolean {
        return this._killed;
    }

    /** Called by the bridge to forward an incoming worker message to this handle. */
    _handleWorkerMessage(msg: WorkerOutMessage): void {
        switch (msg.type) {
            case 'pid':
                this._pid = msg.pid;
                break;
            case 'stdout': {
                // Check backpressure: if push() returns false the consumer is slow.
                // Pause the worker to prevent unbounded memory growth until the stream drains.
                const canContinueStdout = this.stdout.push(Buffer.from(msg.chunk, 'base64'));
                if (!canContinueStdout && !this._killed) {
                    this._send({ type: 'kill', id: this._id, signal: 'SIGSTOP' });
                    this.stdout.once('drain', () => {
                        if (!this._killed) {
                            this._send({ type: 'kill', id: this._id, signal: 'SIGCONT' });
                        }
                    });
                }
                break;
            }
            case 'stderr': {
                const canContinueStderr = this.stderr.push(Buffer.from(msg.chunk, 'base64'));
                if (!canContinueStderr && !this._killed) {
                    this._send({ type: 'kill', id: this._id, signal: 'SIGSTOP' });
                    this.stderr.once('drain', () => {
                        if (!this._killed) {
                            this._send({ type: 'kill', id: this._id, signal: 'SIGCONT' });
                        }
                    });
                }
                break;
            }
            case 'close':
                this.stdout.end();
                this.stderr.end();
                this._killed = true;
                this.emit('close', msg.exitCode);
                break;
            case 'error':
                this._killed = true;
                this.emit('error', new Error(msg.message));
                break;
        }
    }

    kill(signal: NodeJS.Signals | string | number = 'SIGTERM'): boolean {
        if (this._killed) return false;
        this._send({ type: 'kill', id: this._id, signal: String(signal) });
        return true;
    }

    /** Fail an in-flight job when the shared worker dies or is torn down. */
    _failFromWorkerLoss(message: string): void {
        if (this._killed) {
            return;
        }
        this.stdout.end();
        this.stderr.end();
        this._killed = true;
        this.emit('error', new Error(message));
    }
}

let workerProcess: ReturnType<typeof utilityProcess.fork> | null = null;
const handles = new Map<string, YtdlpProcessHandle>();

function failInFlightHandles(message: string): void {
    for (const [, handle] of handles) {
        handle._failFromWorkerLoss(message);
    }
    handles.clear();
}

function ensureWorker(): ReturnType<typeof utilityProcess.fork> {
    if (workerProcess) return workerProcess;

    workerProcess = utilityProcess.fork(ytdlpWorkerPath, [], {
        serviceName: 'yt-dlp-worker',
        // Workers do not get a usable `app` singleton; pin the same userData root.
        env: {
            ...process.env,
            KAJO_USER_DATA: electronUserDataPath()
        }
    });

    workerProcess.on('message', (msg: WorkerOutMessage) => {
        const handle = handles.get(msg.id);
        if (!handle) return;
        // Remove mapping BEFORE forwarding terminal messages so that retry code can
        // synchronously register a new handle with the same ID inside the 'close' / 'error'
        // handler without being overwritten by the cleanup below.
        if (msg.type === 'close' || msg.type === 'error') {
            handles.delete(msg.id);
        }
        handle._handleWorkerMessage(msg);
    });

    workerProcess.on('exit', () => {
        workerProcess = null;
        failInFlightHandles(YTDLP_WORKER_UNEXPECTED_EXIT_ERROR);
    });

    return workerProcess;
}

/**
 * Spawn a yt-dlp invocation inside the isolated UtilityProcess worker.
 *
 * @param id       Unique ID for this invocation (used for message routing).
 * @param command  Resolved yt-dlp executable path.
 * @param args     Argument list passed to yt-dlp.
 * @param env      Environment variables for the child process.
 */
export function spawnYtdlpProcess(
    id: string,
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv
): YtdlpProcessHandle {
    const worker = ensureWorker();
    const handle = new YtdlpProcessHandle(id, (msg) => worker.postMessage(msg));
    handles.set(id, handle);
    worker.postMessage({ type: 'spawn', id, command, args, env });
    return handle;
}

/**
 * Gracefully shut down the shared yt-dlp UtilityProcess worker.
 *
 * Sends a `shutdown` message so the worker can SIGTERM → SIGKILL its yt-dlp / ffmpeg
 * child processes before exiting. Awaits the worker's `exit` event for up to
 * `gracefulTimeoutMs` before falling back to `wp.kill()`. This is critical for
 * avoiding orphaned yt-dlp / ffmpeg processes on app quit.
 *
 * Safe to call multiple times or if the worker was never started.
 */
export async function teardownYtdlpWorker(
    opts: { gracefulTimeoutMs?: number } = {}
): Promise<void> {
    if (!workerProcess) {
        return;
    }
    const wp = workerProcess;
    workerProcess = null;
    failInFlightHandles(YTDLP_WORKER_SHUTDOWN_ERROR);

    const gracefulTimeoutMs = opts.gracefulTimeoutMs ?? 3_000;

    const exited = new Promise<void>((resolve) => {
        try {
            wp.once('exit', () => resolve());
        } catch {
            resolve();
        }
    });

    try {
        wp.postMessage({ type: 'shutdown' });
    } catch {
        // Already gone — skip to the hard kill below.
    }

    const timedOut = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), gracefulTimeoutMs);
    });

    const outcome = await Promise.race([exited.then(() => 'exited' as const), timedOut]);
    if (outcome === 'timeout') {
        try {
            wp.kill();
        } catch {
            // Already gone — safe to ignore
        }
    }
}
