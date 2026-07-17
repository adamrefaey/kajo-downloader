/**
 * QA: Top-20 rollout site #8 (Dailymotion) — metadata resolve paths.
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

describe('rollout #8 Dailymotion — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks dailymotion as rollout rank 8', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[7]).toBe('dailymotion');
        expect(listSiteProfilesInRolloutOrder()[7]?.siteId).toBe('dailymotion');
    });

    it('builds static context for video, short dai.ly host, and playlist path', () => {
        const video = buildStaticMetadataResolveContext('https://www.dailymotion.com/video/x8abcd');
        expect(video.siteId).toBe('dailymotion');
        expect(video.candidateMode).toBe('single');
        expect(video.authCookiesRecommended).toBe(true);

        const short = buildStaticMetadataResolveContext('https://dai.ly/x9efgh');
        expect(short.siteId).toBe('dailymotion');
        expect(short.candidateMode).toBe('single');

        const pl = buildStaticMetadataResolveContext('https://www.dailymotion.com/playlist/x1234');
        expect(pl.siteId).toBe('dailymotion');
        expect(pl.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'dailymotion',
                title: 'Playlist',
                entries: [
                    {
                        id: 'x1',
                        title: 'A',
                        url: 'https://www.dailymotion.com/video/x1',
                        duration: 50
                    },
                    {
                        id: 'x2',
                        title: 'B',
                        url: 'https://www.dailymotion.com/video/x2',
                        duration: 55
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.dailymotion.com/playlist/x99';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('dailymotion');
        expect(r.extractorKey).toBe('dailymotion');
        expect(r.entryCount).toBe(2);
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns single from single-video probe', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'dailymotion',
                id: 'x7',
                title: 'News clip',
                webpage_url: 'https://www.dailymotion.com/video/x7',
                duration: 180
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.dailymotion.com/video/x7';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('dailymotion');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.dailymotion.com/video/xprivate';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('dailymotion');
        expect(r.siteDisplayName).toBe('Dailymotion');
        expect(r.signInTargetUrl).toBe('https://www.dailymotion.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps dailymotion:user extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'dailymotion:user',
                id: 'u1',
                title: 'User upload',
                webpage_url: 'https://www.dailymotion.com/video/u1',
                duration: 20
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.dailymotion.com/video/u1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('dailymotion');
        expect(r.extractorKey).toBe('dailymotion:user');
        expect(spawnPlans).toHaveLength(0);
    });
});
