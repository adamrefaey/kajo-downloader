#!/usr/bin/env node

/**
 * Lightweight liveness check for scripts/binary-pins.json.
 * Confirms each pinned GitHub release tag exists and names the expected assets.
 * Does not download assets (fetch-binaries does SHA-256 verification).
 *
 * Usage: node scripts/verify-binary-pins.mjs
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FFMPEG_BTBN_TARGET_IDS, validateBinaryPins } from './lib/binaryPins.mjs';
import { getGitHubReleaseByTag } from './lib/githubRelease.mjs';

const USER_AGENT = 'kajo-downloader-verify-binary-pins';
const pinsPath = join(import.meta.dirname, 'binary-pins.json');

const pins = JSON.parse(await readFile(pinsPath, 'utf8'));
validateBinaryPins(pins);

/** @type {Array<{ label: string, owner: string, repo: string, tag: string, assetNames: string[] }>} */
const checks = [
    {
        label: `yt-dlp ${pins.ytdlp.owner}/${pins.ytdlp.repo}@${pins.ytdlp.tag}`,
        owner: pins.ytdlp.owner,
        repo: pins.ytdlp.repo,
        tag: pins.ytdlp.tag,
        assetNames: Object.keys(pins.ytdlp.sha256)
    },
    {
        label: `ffmpegBtbn ${pins.ffmpegBtbn.owner}/${pins.ffmpegBtbn.repo}@${pins.ffmpegBtbn.tag}`,
        owner: pins.ffmpegBtbn.owner,
        repo: pins.ffmpegBtbn.repo,
        tag: pins.ffmpegBtbn.tag,
        assetNames: FFMPEG_BTBN_TARGET_IDS.map((id) => pins.ffmpegBtbn.targets[id].assetName)
    },
    {
        label: `ffmpegDarwin ${pins.ffmpegDarwinStatic.owner}/${pins.ffmpegDarwinStatic.repo}@${pins.ffmpegDarwinStatic.tag}`,
        owner: pins.ffmpegDarwinStatic.owner,
        repo: pins.ffmpegDarwinStatic.repo,
        tag: pins.ffmpegDarwinStatic.tag,
        assetNames: Object.keys(pins.ffmpegDarwinStatic.sha256)
    },
    {
        label: `deno ${pins.deno.owner}/${pins.deno.repo}@${pins.deno.tag}`,
        owner: pins.deno.owner,
        repo: pins.deno.repo,
        tag: pins.deno.tag,
        assetNames: Object.values(pins.deno.assets)
    }
];

let failed = false;
for (const check of checks) {
    try {
        const release = await getGitHubReleaseByTag(check.owner, check.repo, check.tag, USER_AGENT);
        const present = new Set(release.assets.map((a) => a.name));
        const missing = check.assetNames.filter((name) => !present.has(name));
        if (missing.length > 0) {
            failed = true;
            console.error(`[verify-binary-pins] FAIL ${check.label}`);
            for (const name of missing) {
                console.error(`  missing asset: ${name}`);
            }
            continue;
        }
        console.log(`[verify-binary-pins] ok ${check.label} (${check.assetNames.length} assets)`);
    } catch (error) {
        failed = true;
        console.error(`[verify-binary-pins] FAIL ${check.label}`);
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
}

if (failed) {
    console.error(
        '[verify-binary-pins] One or more pins are unavailable. For BtbN ffmpeg, run `pnpm run binaries:bump-ffmpeg`.'
    );
    process.exit(1);
}

console.log('[verify-binary-pins] all pins resolvable.');
