import { spawn } from 'node:child_process';
import { IS_WIN } from './downloadEngineConstants';

/**
 * Kill an entire process tree. On Unix, sends signal to the negative PID (process group).
 * On Windows, uses taskkill with /T (tree) flag.
 */
export function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    try {
        if (IS_WIN) {
            const flag = signal === 'SIGKILL' ? '/f' : '';
            spawn('taskkill', ['/pid', String(pid), '/t', flag].filter(Boolean), {
                stdio: 'ignore'
            });
        } else {
            process.kill(-pid, signal);
        }
    } catch {
        // Process may already be dead; ignore.
        try {
            process.kill(pid, signal);
        } catch {
            // fallback also failed; truly dead
        }
    }
}
