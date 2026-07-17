/**
 * QA: Top-20 rollout site #4 (Facebook) — metadata resolve paths for single, multi, and auth-required.
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

describe('rollout #4 Facebook — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks Facebook as rollout rank 4', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[3]).toBe('facebook');
        expect(listSiteProfilesInRolloutOrder()[3]?.siteId).toBe('facebook');
    });

    it('builds static context for watch, fb.watch, reel, page videos tab, and m.facebook', () => {
        const watch = buildStaticMetadataResolveContext(
            'https://www.facebook.com/watch?v=1234567890123456'
        );
        expect(watch.siteId).toBe('facebook');
        expect(watch.candidateMode).toBe('single');
        expect(watch.authCookiesRecommended).toBe(true);

        const short = buildStaticMetadataResolveContext('https://fb.watch/abc123xyz/');
        expect(short.siteId).toBe('facebook');
        expect(short.candidateMode).toBe('single');

        const reel = buildStaticMetadataResolveContext(
            'https://www.facebook.com/reel/987654321098765/'
        );
        expect(reel.siteId).toBe('facebook');
        expect(reel.candidateMode).toBe('single');

        const videosTab = buildStaticMetadataResolveContext(
            'https://www.facebook.com/SomePage/videos/'
        );
        expect(videosTab.siteId).toBe('facebook');
        expect(videosTab.candidateMode).toBe('multi');

        const mobile = buildStaticMetadataResolveContext(
            'https://m.facebook.com/watch/?v=1234567890123456'
        );
        expect(mobile.siteId).toBe('facebook');
        expect(mobile.candidateMode).toBe('single');
    });

    it('returns multi with candidates for facebook flat playlist (2+ entries)', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'facebook',
                title: 'Page videos',
                entries: [
                    {
                        id: '1111111111111111',
                        title: 'First clip',
                        url: 'https://www.facebook.com/watch?v=1111111111111111',
                        duration: 42
                    },
                    {
                        id: '2222222222222222',
                        title: 'Second clip',
                        url: 'https://www.facebook.com/watch?v=2222222222222222',
                        duration: 88
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.facebook.com/examplepage/videos/';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('facebook');
        expect(r.extractorKey).toBe('facebook');
        expect(r.entryCount).toBe(2);
        expect(r.candidates).toHaveLength(2);
        expect(r.candidates?.[0]?.title).toBe('First clip');
        expect(spawnPlans).toHaveLength(0);
    });

    it('reconstructs watch permalinks when flat entries omit http URLs', () => {
        const candidates = normalizePlaylistEntries(
            [
                {
                    id: '1234567890123456',
                    title: 'From flat',
                    duration: 30
                }
            ],
            'https://www.facebook.com/page/videos/'
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.url).toBe('https://www.facebook.com/watch?v=1234567890123456');
    });

    it('returns single when flat probe returns exactly one entry', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'facebook',
                entries: [
                    {
                        id: '9999999999999999',
                        title: 'Solo',
                        url: 'https://www.facebook.com/watch?v=9999999999999999',
                        duration: 12
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.facebook.com/watch?v=9999999999999999';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.url).toBe('https://www.facebook.com/watch?v=9999999999999999');
        expect(r.siteId).toBe('facebook');
        expect(r.extractorKey).toBe('facebook');
        expect(spawnPlans).toHaveLength(0);
    });

    it('falls back to single-video probe when flat probe fails on a watch URL', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: Unsupported URL'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'facebook',
                id: '8888888888888888',
                title: 'Direct json',
                webpage_url: 'https://www.facebook.com/watch?v=8888888888888888',
                duration: 20
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.facebook.com/watch?v=8888888888888888';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('facebook');
        expect(r.extractorKey).toBe('facebook');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.facebook.com/watch?v=7777777777777777';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('facebook');
        expect(r.siteDisplayName).toBe('Facebook');
        expect(r.signInTargetUrl).toBe('https://www.facebook.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps facebook:reel extractor key to facebook site via loose match', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'facebook:reel',
                entries: []
            })
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'facebook:reel',
                id: '6666666666666666',
                title: 'Reel title',
                webpage_url: 'https://www.facebook.com/reel/6666666666666666/',
                duration: 15
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.facebook.com/reel/6666666666666666/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('facebook');
        expect(r.extractorKey).toBe('facebook:reel');
        expect(spawnPlans).toHaveLength(0);
    });
});
