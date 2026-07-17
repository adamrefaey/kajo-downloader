/**
 * QA: Top-20 rollout site #7 (Vimeo) — metadata resolve paths.
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

describe('rollout #7 Vimeo — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks vimeo as rollout rank 7', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[6]).toBe('vimeo');
        expect(listSiteProfilesInRolloutOrder()[6]?.siteId).toBe('vimeo');
    });

    it('builds static context for vimeo.com, player embed host, and album path', () => {
        const video = buildStaticMetadataResolveContext('https://vimeo.com/123456789');
        expect(video.siteId).toBe('vimeo');
        expect(video.candidateMode).toBe('single');
        expect(video.authCookiesRecommended).toBe(true);

        const player = buildStaticMetadataResolveContext(
            'https://player.vimeo.com/video/987654321'
        );
        expect(player.siteId).toBe('vimeo');
        expect(player.candidateMode).toBe('single');

        const album = buildStaticMetadataResolveContext('https://vimeo.com/album/555');
        expect(album.siteId).toBe('vimeo');
        expect(album.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two videos', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'vimeo',
                title: 'Showcase',
                entries: [
                    {
                        id: 'a',
                        title: 'One',
                        url: 'https://vimeo.com/1',
                        duration: 60
                    },
                    {
                        id: 'b',
                        title: 'Two',
                        url: 'https://vimeo.com/2',
                        duration: 90
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://vimeo.com/album/555';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('vimeo');
        expect(r.extractorKey).toBe('vimeo');
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
                extractor_key: 'vimeo',
                id: '777',
                title: 'Staff pick',
                webpage_url: 'https://vimeo.com/777',
                duration: 200
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://vimeo.com/777';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('vimeo');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://vimeo.com/private/1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('vimeo');
        expect(r.siteDisplayName).toBe('Vimeo');
        expect(r.signInTargetUrl).toBe('https://vimeo.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps vimeo:channel extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'vimeo:channel',
                id: 'ch1',
                title: 'Channel item',
                webpage_url: 'https://vimeo.com/channels/staffpicks/1',
                duration: 40
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://vimeo.com/channels/staffpicks/1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('vimeo');
        expect(r.extractorKey).toBe('vimeo:channel');
        expect(spawnPlans).toHaveLength(0);
    });
});
