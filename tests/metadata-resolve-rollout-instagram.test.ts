/**
 * QA: Top-20 rollout site #3 (Instagram) — metadata resolve paths for single, multi, and auth-required.
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

describe('rollout #3 Instagram — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks Instagram as rollout rank 3', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[2]).toBe('instagram');
        expect(listSiteProfilesInRolloutOrder()[2]?.siteId).toBe('instagram');
    });

    it('builds static context for reel, post, profile, and hashtag URLs', () => {
        const reel = buildStaticMetadataResolveContext(
            'https://www.instagram.com/reel/CxYz1234567/'
        );
        expect(reel.siteId).toBe('instagram');
        expect(reel.candidateMode).toBe('single');
        expect(reel.authCookiesRecommended).toBe(true);

        const post = buildStaticMetadataResolveContext('https://www.instagram.com/p/AbCdEfGhIjK/');
        expect(post.siteId).toBe('instagram');
        expect(post.candidateMode).toBe('single');

        const profile = buildStaticMetadataResolveContext('https://www.instagram.com/natgeo/');
        expect(profile.siteId).toBe('instagram');
        expect(profile.candidateMode).toBe('multi');

        const tag = buildStaticMetadataResolveContext(
            'https://www.instagram.com/explore/tags/sunset/'
        );
        expect(tag.siteId).toBe('instagram');
        expect(tag.candidateMode).toBe('multi');
    });

    it('returns multi with candidates for instagram:user flat probe (2+ entries)', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'instagram:user',
                title: '@creator',
                entries: [
                    {
                        id: 'AAA111bbb22',
                        title: 'First reel',
                        url: 'https://www.instagram.com/reel/AAA111bbb22/',
                        duration: 15
                    },
                    {
                        id: 'BBB222ccc33',
                        title: 'Second post',
                        url: 'https://www.instagram.com/p/BBB222ccc33/',
                        duration: 30
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.instagram.com/somecreator/';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('instagram');
        expect(r.extractorKey).toBe('instagram:user');
        expect(r.entryCount).toBe(2);
        expect(r.candidates).toHaveLength(2);
        expect(r.candidates?.[0]?.title).toBe('First reel');
        expect(spawnPlans).toHaveLength(0);
    });

    it('reconstructs Instagram permalinks when flat entries omit http URLs', () => {
        const candidates = normalizePlaylistEntries(
            [
                {
                    id: 'Shortcode1x',
                    title: 'From flat',
                    duration: 8
                }
            ],
            'https://www.instagram.com/somecreator/'
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.url).toBe('https://www.instagram.com/p/Shortcode1x/');
    });

    it('returns single when flat probe returns exactly one entry', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'instagram:user',
                entries: [
                    {
                        id: 'OnlyOneCode',
                        title: 'Solo clip',
                        url: 'https://www.instagram.com/reel/OnlyOneCode/',
                        duration: 5
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.instagram.com/onepostuser/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.url).toBe('https://www.instagram.com/reel/OnlyOneCode/');
        expect(r.siteId).toBe('instagram');
        expect(r.extractorKey).toBe('instagram:user');
        expect(spawnPlans).toHaveLength(0);
    });

    it('falls back to single-video probe when flat probe fails on a reel URL', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat playlist not supported for this URL'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'Instagram',
                id: 'ReelFallback',
                title: 'Direct reel json',
                webpage_url: 'https://www.instagram.com/reel/ReelFallback/',
                duration: 7
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.instagram.com/reel/ReelFallback/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('instagram');
        expect(r.extractorKey).toBe('Instagram');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.instagram.com/p/PrivatePost123/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('instagram');
        expect(r.siteDisplayName).toBe('Instagram');
        expect(r.signInTargetUrl).toBe('https://www.instagram.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps instagram:tag extractor key to instagram site via loose match', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'instagram:tag',
                title: '#hiking',
                entries: [
                    {
                        id: 'TagEntry01',
                        title: 'Trail clip',
                        url: 'https://www.instagram.com/reel/TagEntry01/',
                        duration: 12
                    },
                    {
                        id: 'TagEntry02',
                        title: 'Summit',
                        url: 'https://www.instagram.com/p/TagEntry02/',
                        duration: 20
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.instagram.com/explore/tags/hiking/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('instagram');
        expect(r.extractorKey).toBe('instagram:tag');
        expect(spawnPlans).toHaveLength(0);
    });
});
