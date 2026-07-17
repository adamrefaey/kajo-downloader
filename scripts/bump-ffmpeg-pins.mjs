#!/usr/bin/env node

/**
 * Refresh ffmpegBtbn pins from a BtbN/FFmpeg-Builds release.
 *
 * Requires month-end autobuild tags (kept ~2 years) and n{releaseLine} GPL assets.
 *
 * Usage:
 *   node scripts/bump-ffmpeg-pins.mjs              # newest month-end with matching assets
 *   node scripts/bump-ffmpeg-pins.mjs --tag autobuild-2026-06-30-13-34
 *   node scripts/bump-ffmpeg-pins.mjs --release-line 8.1
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
    FFMPEG_BTBN_TARGET_IDS,
    isMonthEndAutobuildTag,
    pickBtbnReleaseLineAssetName,
    validateBinaryPins
} from './lib/binaryPins.mjs';
import { getGitHubReleaseByTag, listGitHubReleases } from './lib/githubRelease.mjs';

const USER_AGENT = 'kajo-downloader-bump-ffmpeg-pins';
const pinsPath = join(import.meta.dirname, 'binary-pins.json');
const tempRoot = join(import.meta.dirname, '..', 'resources', '.tmp', 'bump-ffmpeg');

const args = parseArgs(process.argv.slice(2));
if (args.help) {
    printHelp();
    process.exit(0);
}

const pins = JSON.parse(await readFile(pinsPath, 'utf8'));
validateBinaryPins(pins);

const releaseLine = args.releaseLine ?? pins.ffmpegBtbn.releaseLine ?? '8.1';
const owner = pins.ffmpegBtbn.owner;
const repo = pins.ffmpegBtbn.repo;

const tag = args.tag ?? (await findNewestMonthEndTag(owner, repo, releaseLine));
if (!isMonthEndAutobuildTag(tag)) {
    throw new Error(
        `Tag "${tag}" is not a month-end autobuild. Pass a month-end tag or omit --tag to auto-select.`
    );
}
console.log(`[bump-ffmpeg-pins] ${owner}/${repo}@${tag} (releaseLine ${releaseLine})`);

const release = await getGitHubReleaseByTag(owner, repo, tag, USER_AGENT);
const targets = {};

await rm(tempRoot, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });

for (const targetId of FFMPEG_BTBN_TARGET_IDS) {
    const assetName = pickBtbnReleaseLineAssetName(release.assets, targetId, releaseLine);
    if (!assetName) {
        throw new Error(`No n${releaseLine} GPL asset for ${targetId} in ${owner}/${repo}@${tag}`);
    }
    const asset = release.assets.find((a) => a.name === assetName);
    const archivePath = join(tempRoot, assetName);
    await mkdir(dirname(archivePath), { recursive: true });
    console.log(`[bump-ffmpeg-pins] downloading ${assetName}`);
    await downloadFile(asset.browser_download_url, archivePath);
    const sha256 = await fileSha256Hex(archivePath);
    targets[targetId] = { assetName, sha256 };
    console.log(`[bump-ffmpeg-pins] ${targetId} sha256=${sha256.slice(0, 16)}…`);
}

pins.ffmpegBtbn.tag = tag;
pins.ffmpegBtbn.releaseLine = releaseLine;
pins.ffmpegBtbn.targets = targets;
validateBinaryPins(pins);

await writeFile(pinsPath, `${JSON.stringify(pins, null, 4)}\n`, 'utf8');
await rm(tempRoot, { recursive: true, force: true });
console.log(`[bump-ffmpeg-pins] wrote ${pinsPath}`);

function parseArgs(argv) {
    const out = { help: false, tag: null, releaseLine: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            out.help = true;
        } else if (arg === '--tag') {
            out.tag = argv[++i];
        } else if (arg === '--release-line') {
            out.releaseLine = argv[++i];
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return out;
}

function printHelp() {
    console.log(`Usage: node scripts/bump-ffmpeg-pins.mjs [--tag TAG] [--release-line 8.1]

Updates scripts/binary-pins.json ffmpegBtbn block from BtbN/FFmpeg-Builds.
Default tag: newest month-end autobuild that publishes n{releaseLine} GPL assets.`);
}

async function findNewestMonthEndTag(owner, repo, releaseLine) {
    for (let page = 1; page <= 5; page += 1) {
        const releases = await listGitHubReleases(owner, repo, USER_AGENT, page);
        if (!Array.isArray(releases) || releases.length === 0) {
            break;
        }
        for (const release of releases) {
            const candidate = release.tag_name;
            if (candidate === 'latest' || !isMonthEndAutobuildTag(candidate)) {
                continue;
            }
            const hasAll = FFMPEG_BTBN_TARGET_IDS.every(
                (id) => pickBtbnReleaseLineAssetName(release.assets ?? [], id, releaseLine) != null
            );
            if (hasAll) {
                return candidate;
            }
        }
    }
    throw new Error(
        `No month-end BtbN release found with n${releaseLine} GPL assets for all targets. Pass --tag explicitly.`
    );
}

async function downloadFile(url, destination) {
    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
    });
    if (!response.ok || !response.body) {
        const body = await response.text().catch(() => '');
        throw new Error(`Download failed: ${response.status}\n${body}`);
    }
    await pipeline(response.body, createWriteStream(destination));
}

async function fileSha256Hex(filePath) {
    return new Promise((resolvePromise, rejectPromise) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('error', rejectPromise);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolvePromise(hash.digest('hex')));
    });
}
