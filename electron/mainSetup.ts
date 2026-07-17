import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import type {
    PrepareChannelOutputDirPayload,
    PrepareChannelOutputDirResult,
    PreparePlaylistOutputDirPayload
} from '../src/shared/ipcContract';
import type { SetupStatus } from '../src/types';
import { prepareChannelOutputDirectory, preparePlaylistOutputDirectory } from './mainHelpers';
import { hasBundledBinary } from './services/binaries';
import {
    probeYtDlpVersion,
    ytDlpReportedVersionSatisfiesMinimum
} from './services/ytdlpVersionProbe';

export async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

export async function commandExists(command: string): Promise<boolean> {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const child = spawn('which', [command], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    return promise;
}

export async function checkSetupStatus(): Promise<SetupStatus> {
    if (app.isPackaged) {
        return {
            ytdlpInstalled: true,
            ffmpegInstalled: true,
            homebrewInstalled: false,
            ytdlpVersion: null,
            ytdlpMeetsMinimumVersion: true,
            ytdlpReady: true
        };
    }

    const [hasBundledYtdlp, hasBundledFfmpeg, hasSystemYtdlp, hasSystemFfmpeg, homebrewInstalled] =
        await Promise.all([
            hasBundledBinary('yt-dlp'),
            hasBundledBinary('ffmpeg'),
            commandExists('yt-dlp'),
            commandExists('ffmpeg'),
            commandExists('brew')
        ]);
    const ytdlpInstalled = hasBundledYtdlp || hasSystemYtdlp;
    const ffmpegInstalled = hasBundledFfmpeg || hasSystemFfmpeg;
    let ytdlpVersion: string | null = null;
    if (ytdlpInstalled) {
        ytdlpVersion = await probeYtDlpVersion();
    }
    const ytdlpMeetsMinimumVersion =
        !ytdlpInstalled || ytDlpReportedVersionSatisfiesMinimum(ytdlpVersion);
    return {
        ytdlpInstalled,
        ffmpegInstalled,
        homebrewInstalled,
        ytdlpVersion,
        ytdlpMeetsMinimumVersion,
        ytdlpReady: ytdlpInstalled && ffmpegInstalled && ytdlpMeetsMinimumVersion
    };
}

export async function preparePlaylistOutputDirectoryForMain(
    payload: PreparePlaylistOutputDirPayload
): Promise<string> {
    return preparePlaylistOutputDirectory(payload, {
        join,
        mkdirRecursive: async (p) => {
            await mkdir(p, { recursive: true });
        },
        pathExists
    });
}

export async function prepareChannelOutputDirectoryForMain(
    payload: PrepareChannelOutputDirPayload
): Promise<PrepareChannelOutputDirResult> {
    return prepareChannelOutputDirectory(payload, {
        join,
        mkdirRecursive: async (p) => {
            await mkdir(p, { recursive: true });
        },
        pathExists
    });
}
