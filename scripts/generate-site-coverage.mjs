#!/usr/bin/env node
/**
 * Regenerates `src/shared/generated/siteCoverage.v1.json` from the yt-dlp on PATH.
 * Run from repo: `pnpm run generate:site-coverage` (desktop package).
 *
 * Keeps `rolloutTop20` in sync with `src/shared/siteProfiles.ts` (each profile’s
 * `extractorKeys[0]`, `demandScore`, and `rolloutRank`) — update both when changing the lock.
 *
 * The `extractors` array is the raw `yt-dlp --list-extractors` output (including sites the
 * app blocks). Kajo allow/deny policy for URLs is enforced in `prohibitedAdultContentHosts.ts`
 * and validation — not by filtering this file.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const outPath = join(projectRoot, 'src/shared/generated/siteCoverage.v1.json');

/** Minimum yt-dlp calver aligned with `ytdlpVersionPolicy.ts` (document only here). */
const REFERENCED_MIN_YTDLP_VERSION = '2025.03.26';

/**
 * Locked top-20 rollout: (siteId, primary yt-dlp extractor key, demand score).
 * Order is product priority; scores are relative weights for ranking documentation.
 */
const ROLLOUT_TOP_20 = [
    ['youtube', 'youtube', 100],
    ['tiktok', 'TikTok', 95],
    ['instagram', 'Instagram', 92],
    ['facebook', 'facebook', 90],
    ['twitter', 'twitter', 88],
    ['twitch', 'twitch:vod', 85],
    ['vimeo', 'vimeo', 82],
    ['dailymotion', 'dailymotion', 80],
    ['reddit', 'Reddit', 78],
    ['rumble', 'Rumble', 76],
    ['bilibili', 'BiliBili', 74],
    ['soundcloud', 'soundcloud', 72],
    ['bbc', 'bbc', 65],
    ['pbs', 'pbs', 62],
    ['nbc', 'NBC', 60],
    ['vk', 'vk', 58],
    ['streamable', 'Streamable', 55],
    ['linkedin', 'LinkedIn', 52],
    ['bandcamp', 'Bandcamp', 50],
    ['mixcloud', 'mixcloud', 48]
];

function runYtDlp(args) {
    const r = spawnSync('yt-dlp', args, { encoding: 'utf8' });
    if (r.error) {
        throw new Error(
            `Failed to run yt-dlp: ${r.error.message}\nInstall yt-dlp or use PATH with yt-dlp available.`
        );
    }
    if (r.status !== 0) {
        throw new Error(`yt-dlp ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout;
}

function parseExtractorsList(stdout) {
    const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    return lines.map((line) => {
        const broken = line.includes('(CURRENTLY BROKEN)');
        const key = broken ? line.replace(/\s+\(CURRENTLY BROKEN\)\s*$/, '').trim() : line;
        return { key, broken };
    });
}

function main() {
    const versionOut = runYtDlp(['--version']);
    const ytdlpVersion =
        versionOut
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)[0] ?? '';

    const listOut = runYtDlp(['--list-extractors']);
    const extractors = parseExtractorsList(listOut);
    const keySet = new Set(extractors.map((e) => e.key));

    const rolloutTop20 = ROLLOUT_TOP_20.map(
        ([siteId, primaryExtractorKey, demandScore], index) => ({
            siteId,
            rank: index + 1,
            demandScore,
            primaryExtractorKey,
            extractorPresent: keySet.has(primaryExtractorKey)
        })
    );

    const missing = rolloutTop20.filter((r) => !r.extractorPresent);
    if (missing.length > 0) {
        console.warn(
            '[generate-site-coverage] Warning: rollout extractors missing from yt-dlp list:',
            missing.map((m) => m.primaryExtractorKey).join(', ')
        );
    }

    const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        ytdlpVersion,
        referencedMinYtdlpVersion: REFERENCED_MIN_YTDLP_VERSION,
        extractorCount: extractors.length,
        extractors,
        rolloutTop20
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`[generate-site-coverage] wrote ${outPath} (${extractors.length} extractors).`);
}

main();
