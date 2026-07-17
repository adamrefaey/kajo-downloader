/**
 * QA: Top-20 rollout site #2 (TikTok) — metadata resolve paths for single, multi, and auth-required.
 */
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePlaylistEntries } from '../electron/services/metadata/playlistEntries';
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

describe('rollout #2 TikTok — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks TikTok as rollout rank 2', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[1]).toBe('tiktok');
        expect(listSiteProfilesInRolloutOrder()[1]?.siteId).toBe('tiktok');
    });

    it('builds static context for video, vm short link, and profile URL', () => {
        const video = buildStaticMetadataResolveContext(
            'https://www.tiktok.com/@creator/video/7123456789012345678'
        );
        expect(video.siteId).toBe('tiktok');
        expect(video.candidateMode).toBe('single');
        expect(video.authCookiesRecommended).toBe(true);

        const vm = buildStaticMetadataResolveContext('https://vm.tiktok.com/ZMxxxxxxx/');
        expect(vm.siteId).toBe('tiktok');
        expect(vm.candidateMode).toBe('single');

        const profile = buildStaticMetadataResolveContext('https://www.tiktok.com/@creator');
        expect(profile.siteId).toBe('tiktok');
        expect(profile.candidateMode).toBe('multi');
    });

    it('returns multi with candidates for tiktok:user flat probe (2+ entries)', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'tiktok:user',
                title: '@creator',
                entries: [
                    {
                        id: '7111111111111111111',
                        title: 'First',
                        url: 'https://www.tiktok.com/@creator/video/7111111111111111111',
                        duration: 12
                    },
                    {
                        id: '7222222222222222222',
                        title: 'Second',
                        url: 'https://www.tiktok.com/@creator/video/7222222222222222222',
                        duration: 8
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.tiktok.com/@creator';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('tiktok');
        expect(r.extractorKey).toBe('tiktok:user');
        expect(r.entryCount).toBe(2);
        expect(r.candidates).toHaveLength(2);
        expect(r.candidates?.[0]?.title).toBe('First');
        expect(spawnPlans).toHaveLength(0);
    });

    it('reconstructs TikTok video URLs when flat entries omit http URLs', () => {
        const candidates = normalizePlaylistEntries(
            [
                {
                    id: '7123456789012345678',
                    title: 'From flat',
                    duration: 5
                }
            ],
            'https://www.tiktok.com/@creator'
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.url).toBe(
            'https://www.tiktok.com/@creator/video/7123456789012345678'
        );
    });

    it('returns single when flat probe returns exactly one entry', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'tiktok:user',
                entries: [
                    {
                        id: '7999999999999999999',
                        title: 'Only clip',
                        url: 'https://www.tiktok.com/@u/video/7999999999999999999',
                        duration: 3
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.tiktok.com/@u';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.url).toBe('https://www.tiktok.com/@u/video/7999999999999999999');
        expect(r.siteId).toBe('tiktok');
        expect(r.extractorKey).toBe('tiktok:user');
        expect(spawnPlans).toHaveLength(0);
    });

    it('falls back to single-video probe when flat probe fails on a video URL', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat playlist not supported for this URL'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'TikTok',
                id: '7888888888888888888',
                title: 'Direct video json',
                webpage_url: 'https://www.tiktok.com/@x/video/7888888888888888888',
                duration: 4
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.tiktok.com/@x/video/7888888888888888888';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('tiktok');
        expect(r.extractorKey).toBe('TikTok');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.tiktok.com/@x/video/7000000000000000000';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('tiktok');
        expect(r.siteDisplayName).toBe('TikTok');
        expect(r.signInTargetUrl).toBe('https://www.tiktok.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps vm.tiktok extractor key to tiktok site via loose match', async () => {
        // Flat probe runs first; non-playlist JSON triggers single-video fallback.
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({ extractor_key: 'vm.tiktok', id: '7777777777777777777' })
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'vm.tiktok',
                id: '7777777777777777777',
                title: 'Short link target',
                webpage_url: 'https://www.tiktok.com/@y/video/7777777777777777777',
                duration: 2
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://vm.tiktok.com/ZMabc123/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('tiktok');
        expect(r.extractorKey).toBe('vm.tiktok');
        expect(spawnPlans).toHaveLength(0);
    });
});
