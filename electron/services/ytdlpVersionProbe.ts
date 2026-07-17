import { spawn } from 'node:child_process';
import {
    isYtDlpVersionAtLeast,
    MIN_YTDLP_VERSION,
    parseYtDlpVersionLine
} from '../../src/shared/ytdlpVersionPolicy';
import { trackMainChildProcess } from '../lib/childProcessRegistry';
import { buildYtDlpInvocation } from './binaries';

const PROBE_CACHE_TTL_MS = 120_000;
/** Avoid hanging setup checks if `yt-dlp` never exits (e.g. blocked binary). */
const PROBE_SPAWN_TIMEOUT_MS = 10_000;
let cache: { at: number; version: string | null } | null = null;

export function getMinimumYtDlpVersion(): string {
    return MIN_YTDLP_VERSION;
}

/** Reported calver from `yt-dlp --version`, or null if missing/unreadable. */
export async function probeYtDlpVersion(forceRefresh = false): Promise<string | null> {
    if (!forceRefresh && cache && Date.now() - cache.at < PROBE_CACHE_TTL_MS) {
        return cache.version;
    }

    const version = await probeYtDlpVersionOnce();
    cache = { at: Date.now(), version };
    return version;
}

async function probeYtDlpVersionOnce(): Promise<string | null> {
    try {
        const invocation = await buildYtDlpInvocation(['--version']);
        const combined = await collectSpawnOutput(
            invocation.command,
            invocation.args,
            invocation.env,
            PROBE_SPAWN_TIMEOUT_MS
        );
        return parseYtDlpVersionLine(combined);
    } catch {
        return null;
    }
}

function collectSpawnOutput(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    timeoutMs: number
): Promise<string> {
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    const child = trackMainChildProcess(spawn(command, args, { stdio: 'pipe', env }));
    const timer = setTimeout(() => {
        try {
            child.kill('SIGKILL');
        } catch {
            // ignore
        }
        reject(new Error('yt-dlp version probe timed out'));
    }, timeoutMs);
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => {
        chunks.push(c);
    });
    child.stderr.on('data', (c: Buffer) => {
        chunks.push(c);
    });
    child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
    });
    child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
            reject(new Error(`yt-dlp --version exited with ${code}`));
            return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
    });
    return promise;
}

/**
 * When the reported version is null (probe failed), we do not block the app — only
 * successful parses below the minimum disable `ytdlpReady`.
 */
export function ytDlpReportedVersionSatisfiesMinimum(reported: string | null): boolean {
    if (reported === null) {
        return true;
    }
    return isYtDlpVersionAtLeast(reported, MIN_YTDLP_VERSION);
}
