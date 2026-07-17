import { spawn } from 'node:child_process';
import { trackMainChildProcess } from '../../lib/childProcessRegistry';
import { buildYtDlpInvocation } from '../binaries';
import { DEFAULT_COMMAND_TIMEOUT_MS, PROCESS_FORCE_KILL_DELAY_MS } from './downloadEngineConstants';

export function runCommand(
    command: string,
    args: string[],
    env?: NodeJS.ProcessEnv,
    timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
        const child = trackMainChildProcess(spawn(command, args, { stdio: 'pipe', env }));
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        let killed = false;

        const timer = setTimeout(() => {
            killed = true;
            child.kill('SIGTERM');
            setTimeout(() => {
                if (!child.killed) {
                    child.kill('SIGKILL');
                }
            }, PROCESS_FORCE_KILL_DELAY_MS);
        }, timeoutMs);

        child.stdout.on('data', (chunk: Buffer) => {
            out.push(chunk);
        });
        child.stderr.on('data', (chunk: Buffer) => {
            err.push(chunk);
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', (exitCode) => {
            clearTimeout(timer);
            if (killed) {
                resolve({
                    stdout: Buffer.concat(out).toString('utf8'),
                    stderr: `Process timed out after ${timeoutMs}ms\n${Buffer.concat(err).toString('utf8')}`,
                    exitCode: exitCode ?? 1
                });
            } else {
                resolve({
                    stdout: Buffer.concat(out).toString('utf8'),
                    stderr: Buffer.concat(err).toString('utf8'),
                    exitCode
                });
            }
        });
    });
}

export async function runYtDlpCommand(
    args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const invocation = await buildYtDlpInvocation(args);
    return runCommand(invocation.command, invocation.args, invocation.env);
}
