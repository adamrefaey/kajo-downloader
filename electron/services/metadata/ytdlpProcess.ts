import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { trackMainChildProcess } from '../../lib/childProcessRegistry';
import { mainLog } from '../../mainLogger';
import { buildYtDlpInvocation } from '../binaries';
import { cookieFilePathsFromArgv, unlinkManagedCookieFilesFromArgv } from '../siteAuthCookieStore';
import {
    isYoutubeUrl,
    shouldRetryYoutubeWithAlternatePlayerClient,
    YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS
} from '../youtubeYtdlpDefaults';
import { spawnYtdlpProcess } from '../ytdlp/ytdlpUtilityProcess';
import type { FetchMetadataOptions, MetadataArgsBuilder } from './types';

export function runYtDlp(
    args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const { promise, resolve, reject } = Promise.withResolvers<{
        stdout: string;
        stderr: string;
        exitCode: number | null;
    }>();
    void (async () => {
        const invocation = await buildYtDlpInvocation(args);
        const child = spawnYtdlpProcess(
            randomUUID(),
            invocation.command,
            invocation.args,
            invocation.env
        );
        const out: Buffer[] = [];
        const err: Buffer[] = [];

        child.stdout.on('data', (chunk: Buffer) => {
            out.push(chunk);
        });

        child.stderr.on('data', (chunk: Buffer) => {
            err.push(chunk);
        });

        child.on('error', (error) => {
            reject(error);
        });

        child.on('close', (exitCode) => {
            resolve({
                stdout: Buffer.concat(out).toString('utf8'),
                stderr: Buffer.concat(err).toString('utf8'),
                exitCode
            });
        });
    })().catch(reject);
    return promise;
}

export const playlistStreamProcesses: Map<string, ChildProcess> = new Map();

export function killPlaylistInfoStream(streamId: string): void {
    const child = playlistStreamProcesses.get(streamId);
    if (child && !child.killed) {
        try {
            child.kill('SIGTERM');
        } catch {
            // ignore
        }
    }
    playlistStreamProcesses.delete(streamId);
}

export function runYtDlpStreamingLines(
    args: string[],
    opts: {
        streamKillId: string;
        onLine: (line: string) => void | Promise<void>;
    }
): Promise<{ stderr: string; exitCode: number | null }> {
    const { promise, resolve, reject } = Promise.withResolvers<{
        stderr: string;
        exitCode: number | null;
    }>();
    void (async () => {
        try {
            const invocation = await buildYtDlpInvocation(args);
            const child = trackMainChildProcess(
                spawn(invocation.command, invocation.args, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: invocation.env
                })
            );
            playlistStreamProcesses.set(opts.streamKillId, child);

            const err: Buffer[] = [];
            let buf = '';

            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => {
                buf += chunk;
                const lines = buf.split(/\r?\n/);
                buf = lines.pop() ?? '';
                for (const line of lines) {
                    const t = line.trim();
                    if (t) {
                        void Promise.resolve(opts.onLine(t)).catch((e: unknown) => {
                            mainLog.warn('ytdlp onLine callback rejected', { error: String(e) });
                        });
                    }
                }
            });

            child.stderr.on('data', (c: Buffer) => {
                err.push(c);
            });

            child.on('error', (e) => {
                playlistStreamProcesses.delete(opts.streamKillId);
                reject(e);
            });

            child.on('close', (exitCode) => {
                playlistStreamProcesses.delete(opts.streamKillId);
                const tail = buf.trim();
                if (tail) {
                    void Promise.resolve(opts.onLine(tail)).catch((e: unknown) => {
                        mainLog.warn('ytdlp onLine callback rejected (tail)', { error: String(e) });
                    });
                }
                resolve({
                    stderr: Buffer.concat(err).toString('utf8'),
                    exitCode
                });
            });
        } catch (e) {
            playlistStreamProcesses.delete(opts.streamKillId);
            reject(e);
        }
    })().catch(reject);
    return promise;
}

export type RunYtDlpAuthCookieOptions = {
    /**
     * Keep materialized Netscape cookie files after the probe (download preamble / cookie resolve).
     * Metadata probes leave this false so ephemeral jars are unlinked immediately.
     */
    retainCookieFiles?: boolean;
};

export async function runYtDlpWithAuthCookieStrategies(
    url: string,
    options: FetchMetadataOptions,
    buildArgs: MetadataArgsBuilder,
    runOpts?: RunYtDlpAuthCookieOptions
): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    finalArgs: string[];
}> {
    const retainCookieFiles = runOpts?.retainCookieFiles === true;
    const cookiePaths = new Set<string>();
    const trackCookies = (argv: readonly string[]): void => {
        for (const p of cookieFilePathsFromArgv(argv)) {
            cookiePaths.add(p);
        }
    };

    try {
        const builtArgs = await buildArgs(url, options);
        let finalArgs = builtArgs.args;
        trackCookies(finalArgs);
        let { stdout, stderr, exitCode } = await runYtDlp(builtArgs.args);

        if (
            exitCode !== 0 &&
            isYoutubeUrl(url) &&
            !builtArgs.usedCookies &&
            shouldRetryYoutubeWithAlternatePlayerClient(stderr)
        ) {
            const retryBuilt = await buildArgs(url, {
                ...options,
                youtubeExtractorArgsOverride: [...YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS]
            });
            trackCookies(retryBuilt.args);
            const retry = await runYtDlp(retryBuilt.args);
            stdout = retry.stdout;
            stderr = retry.stderr;
            exitCode = retry.exitCode;
            finalArgs = retryBuilt.args;
        }

        return { stdout, stderr, exitCode, finalArgs };
    } finally {
        if (!retainCookieFiles && cookiePaths.size > 0) {
            const argv: string[] = [];
            for (const p of cookiePaths) {
                argv.push('--cookies', p);
            }
            await unlinkManagedCookieFilesFromArgv(argv);
        }
    }
}
