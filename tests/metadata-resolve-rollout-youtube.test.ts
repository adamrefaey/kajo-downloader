/**
 * QA: Top-20 rollout site #1 (YouTube) — metadata resolve paths for single, multi, and auth-required.
 */
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    listSiteProfilesInRolloutOrder,
    ROLLOUT_TOP_20_SITE_IDS
} from '../src/shared/siteProfiles';
import { buildStaticMetadataResolveContext } from '../src/shared/urlSiteResolveContext';

interface SpawnPlan {
    stdout?: string;
    stderr?: string;
    exitCode: number | null;
}

const spawnPlans: SpawnPlan[] = [];

vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false,
        getAppPath: () => '/app',
        isReady: () => true
    }
}));

vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: vi.fn((_id: string, _command: string, _args: string[]) => {
        const plan = spawnPlans.shift() ?? { exitCode: 0 };
        const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();

        queueMicrotask(() => {
            if (plan.stdout) {
                child.stdout.emit('data', Buffer.from(plan.stdout));
            }
            if (plan.stderr) {
                child.stderr.emit('data', Buffer.from(plan.stderr));
            }
            child.emit('close', plan.exitCode);
        });

        return child;
    })
}));

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async (args: string[]) => ({ command: 'yt-dlp', args }))
}));

describe('rollout #1 YouTube — resolveMediaUrlMetadata', () => {
    beforeEach(async () => {
        spawnPlans.length = 0;
        vi.resetModules();
        const { spawnYtdlpProcess } = await import(
            '../electron/services/ytdlp/ytdlpUtilityProcess'
        );
        vi.mocked(spawnYtdlpProcess).mockClear();
    });

    it('locks YouTube as rollout rank 1', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[0]).toBe('youtube');
        expect(listSiteProfilesInRolloutOrder()[0]?.siteId).toBe('youtube');
    });

    it('builds static context for youtu.be and music.youtube.com', () => {
        const short = buildStaticMetadataResolveContext('https://youtu.be/dQw4w9WgXcQ');
        expect(short.siteId).toBe('youtube');
        expect(short.candidateMode).toBe('single');
        expect(short.authCookiesRecommended).toBe(true);

        const music = buildStaticMetadataResolveContext(
            'https://music.youtube.com/watch?v=dQw4w9WgXcQ'
        );
        expect(music.siteId).toBe('youtube');
        expect(music.candidateMode).toBe('single');
    });

    it('returns multi with candidates for a playlist flat probe (2+ entries)', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'youtube',
                title: 'PL',
                entries: [
                    {
                        id: 'aaaaaaaaaaa',
                        title: 'First',
                        url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
                        channel: 'C',
                        duration: 10
                    },
                    {
                        id: 'bbbbbbbbbbb',
                        title: 'Second',
                        url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
                        channel: 'C',
                        duration: 20
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.youtube.com/playlist?list=PLxxxxxxxx';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('youtube');
        expect(r.extractorKey).toBe('youtube');
        expect(r.youtubeBatchKind).toBe('playlist');
        expect(r.entryCount).toBe(2);
        expect(r.candidates).toHaveLength(2);
        expect(r.candidates?.[0]?.title).toBe('First');
        expect(spawnPlans).toHaveLength(0);
    });

    it('resolves YouTube watch URLs with a single-video probe (skips flat playlist probe)', async () => {
        const { spawnYtdlpProcess } = await import(
            '../electron/services/ytdlp/ytdlpUtilityProcess'
        );
        const spawnMock = vi.mocked(spawnYtdlpProcess);

        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'youtube',
                id: 'dQw4w9WgXcQ',
                title: 'Only',
                webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                channel: 'Ch',
                duration: 5
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(r.siteId).toBe('youtube');
        expect(r.extractorKey).toBe('youtube');
        expect(spawnPlans).toHaveLength(0);

        const ytCall = spawnMock.mock.calls.at(-1);
        expect(ytCall).toBeDefined();
        const argv = ytCall?.[2] as string[] | undefined;
        expect(argv).toBeDefined();
        if (!argv) {
            return;
        }
        expect(argv).toContain('--dump-json');
        expect(argv).toContain('--no-playlist');
        expect(argv).not.toContain('--flat-playlist');
    });

    it('returns single when flat probe returns a lone video object without entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'youtube',
                _type: 'video',
                id: 'flatvideo',
                title: 'Direct video json',
                webpage_url: 'https://www.youtube.com/watch?v=flatvideo'
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.youtube.com/playlist?list=PLsoloOneVideo';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.url).toBe('https://www.youtube.com/watch?v=flatvideo');
        expect(spawnPlans).toHaveLength(0);
    });

    it('falls back to single-video probe when flat probe fails on a watch URL', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'youtube',
                id: 'fallbackid',
                title: 'From single json',
                webpage_url: 'https://www.youtube.com/watch?v=fallbackid',
                channel: 'Z',
                duration: 1
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.youtube.com/watch?v=fallbackid';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('youtube');
        expect(r.extractorKey).toBe('youtube');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required for private video after flat and single failures', async () => {
        const err = 'ERROR: Private video. Sign in if you have been granted access to this video.';
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.youtube.com/watch?v=privateVid';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('youtube');
        expect(r.siteDisplayName).toBe('YouTube');
        expect(r.signInTargetUrl).toBe('https://www.youtube.com');
        expect(r.authReason).toBe('private_or_members');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('does not single-fallback on playlist URL; surfaces auth from flat probe only', async () => {
        const err =
            'ERROR: This playlist is private. Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.youtube.com/playlist?list=PLprivate';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        expect(spawnPlans).toHaveLength(0);
    });

    it('uses uploads playlist URL for channel links (flat probe target)', async () => {
        const { spawnYtdlpProcess } = await import(
            '../electron/services/ytdlp/ytdlpUtilityProcess'
        );
        const spawnMock = vi.mocked(spawnYtdlpProcess);
        const callsBefore = spawnMock.mock.calls.length;

        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'youtube',
                title: 'Uploads',
                entries: [
                    {
                        id: 'chvid',
                        title: 'C vid',
                        url: 'https://www.youtube.com/watch?v=chvid',
                        channel: 'Creator',
                        duration: 3
                    },
                    {
                        id: 'chvid2',
                        title: 'C vid 2',
                        url: 'https://www.youtube.com/watch?v=chvid2',
                        channel: 'Creator',
                        duration: 4
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const channelUrl = 'https://www.youtube.com/channel/UCabcdefghijk';
        const r = await resolveMediaUrlMetadata(channelUrl, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.url).toBe(channelUrl);
        expect(r.youtubeBatchKind).toBe('channel');
        expect(r.entryCount).toBe(2);
        expect(r.youtubePrefetchedUploadsPlaylist).toBeUndefined();

        const ytCall = spawnMock.mock.calls[callsBefore];
        expect(ytCall).toBeDefined();
        const argv = ytCall?.[2] as string[] | undefined;
        expect(argv).toBeDefined();
        if (!argv) {
            return;
        }
        const playlistItemsIdx = argv.indexOf('--playlist-items');
        expect(playlistItemsIdx).toBeGreaterThanOrEqual(0);
        expect(argv[playlistItemsIdx + 1]).toBe('1:2');
        const urlArg = argv.find((a) => a.startsWith('https://www.youtube.com/playlist?list='));
        expect(urlArg).toBe('https://www.youtube.com/playlist?list=UUabcdefghijk');
        expect(spawnPlans).toHaveLength(0);
    });
});
