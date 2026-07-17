/**
 * QA: Top-20 rollout site #19 (Bandcamp) — metadata resolve paths.
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

describe('rollout #19 Bandcamp — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks bandcamp as rollout rank 19', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[18]).toBe('bandcamp');
        expect(listSiteProfilesInRolloutOrder()[18]?.siteId).toBe('bandcamp');
    });

    it('builds static context for track and album on artist subdomain', () => {
        const track = buildStaticMetadataResolveContext(
            'https://artist.bandcamp.com/track/song-name'
        );
        expect(track.siteId).toBe('bandcamp');
        expect(track.candidateMode).toBe('single');
        expect(track.authCookiesRecommended).toBe(false);

        const album = buildStaticMetadataResolveContext(
            'https://artist.bandcamp.com/album/lp-title'
        );
        expect(album.siteId).toBe('bandcamp');
        expect(album.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two tracks', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'Bandcamp',
                title: 'Album',
                entries: [
                    {
                        id: 't1',
                        title: 'Track 1',
                        url: 'https://artist.bandcamp.com/track/t1',
                        duration: 200
                    },
                    {
                        id: 't2',
                        title: 'Track 2',
                        url: 'https://artist.bandcamp.com/track/t2',
                        duration: 220
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://artist.bandcamp.com/album/name';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('bandcamp');
        expect(r.extractorKey).toBe('Bandcamp');
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
                extractor_key: 'Bandcamp',
                id: 'trk',
                title: 'Single',
                webpage_url: 'https://x.bandcamp.com/track/trk',
                duration: 180
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://x.bandcamp.com/track/trk';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('bandcamp');
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps Bandcamp:album extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'Bandcamp:album',
                id: 'alb',
                title: 'Album page',
                webpage_url: 'https://z.bandcamp.com/track/alb',
                duration: 0
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://z.bandcamp.com/track/alb';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('bandcamp');
        expect(r.extractorKey).toBe('Bandcamp:album');
        expect(spawnPlans).toHaveLength(0);
    });
});
