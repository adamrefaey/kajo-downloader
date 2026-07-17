import { spawn } from 'node:child_process';
import { trackMainChildProcess } from '../lib/childProcessRegistry';
import { buildYtDlpInvocation } from './binaries';
import { stripInternalEngineNames } from './userFacingEngineErrors';

export const MAX_QUERY_LEN = 120;
/** yt-dlp `ytsearchN:` upper bound per invocation (pagination loads larger N). */
export const YTSEARCH_MAX_N = 60;

export function sanitizeSearchQuery(raw: string): string {
    const trimmed = raw.trim().slice(0, MAX_QUERY_LEN);
    let out = '';
    for (let i = 0; i < trimmed.length; i += 1) {
        const c = trimmed.charCodeAt(i);
        if (c >= 32) {
            out += trimmed[i];
        }
    }
    return out.replace(/:/g, ' ');
}

export interface FlatEntry {
    id?: string;
    url?: string;
    webpage_url?: string;
    title?: string;
    channel?: string;
    uploader?: string;
    duration?: number;
    thumbnails?: { url?: string }[];
}

/**
 * Shared yt-dlp search primitive — spawns yt-dlp with a search URL and returns flat entries.
 */
export async function searchViaYtDlp(searchUrl: string, maxResults: number): Promise<FlatEntry[]> {
    const { command, args, env } = await buildYtDlpInvocation([
        '-J',
        '--flat-playlist',
        '--no-warnings',
        searchUrl
    ]);

    const { promise: stdoutPromise, resolve, reject } = Promise.withResolvers<string>();
    const child = trackMainChildProcess(
        spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    );
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => {
        out += c;
    });
    child.stderr.on('data', (c) => {
        err += c;
    });
    child.on('error', reject);
    child.on('close', (code) => {
        if (code !== 0) {
            const cleaned = stripInternalEngineNames(err.trim())
                .replace(/\s{2,}/g, ' ')
                .trim();
            reject(new Error(cleaned.length >= 4 ? cleaned : 'Search failed. Please try again.'));
            return;
        }
        resolve(out);
    });
    const stdout = await stdoutPromise;

    let parsed: {
        entries?: FlatEntry[];
        id?: string;
        title?: string;
        url?: string;
        _type?: string;
    };
    try {
        parsed = JSON.parse(stdout) as typeof parsed;
    } catch {
        return [];
    }
    const rawEntries = parsed.entries ?? [];
    let entries = rawEntries.filter(
        (e): e is FlatEntry => e != null && typeof e === 'object' && !Array.isArray(e)
    );
    // Empty `playlist` JSON (e.g. Dailymotion search with no flat entries) still has top-level
    // id/webpage_url — do not promote that to a fake "video" row.
    if (
        entries.length === 0 &&
        parsed._type !== 'playlist' &&
        parsed.id &&
        (parsed.url || parsed.id)
    ) {
        entries = [parsed as FlatEntry];
    }
    return entries.slice(0, maxResults);
}
