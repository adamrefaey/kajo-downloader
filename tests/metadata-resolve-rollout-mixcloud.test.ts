/**
 * QA: Top-20 rollout site #20 (Mixcloud) — metadata resolve paths.
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

describe('rollout #20 Mixcloud — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks mixcloud as rollout rank 20', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[19]).toBe('mixcloud');
        expect(listSiteProfilesInRolloutOrder()[19]?.siteId).toBe('mixcloud');
    });

    it('builds static context for show URL and playlists path', () => {
        const show = buildStaticMetadataResolveContext(
            'https://www.mixcloud.com/djname/show-name/'
        );
        expect(show.siteId).toBe('mixcloud');
        expect(show.candidateMode).toBe('single');
        expect(show.authCookiesRecommended).toBe(true);

        const playlists = buildStaticMetadataResolveContext(
            'https://www.mixcloud.com/djname/playlists/weekly/'
        );
        expect(playlists.siteId).toBe('mixcloud');
        expect(playlists.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two shows', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'mixcloud',
                title: 'Playlist',
                entries: [
                    {
                        id: 'm1',
                        title: 'Mix A',
                        url: 'https://www.mixcloud.com/u/a/',
                        duration: 3600
                    },
                    {
                        id: 'm2',
                        title: 'Mix B',
                        url: 'https://www.mixcloud.com/u/b/',
                        duration: 7200
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.mixcloud.com/curator/playlists/all/';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('mixcloud');
        expect(r.extractorKey).toBe('mixcloud');
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
                extractor_key: 'mixcloud',
                id: 'one',
                title: 'DJ set',
                webpage_url: 'https://www.mixcloud.com/dj/long-set/',
                duration: 10800
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.mixcloud.com/dj/long-set/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('mixcloud');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.mixcloud.com/private/show/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('mixcloud');
        expect(r.siteDisplayName).toBe('Mixcloud');
        expect(r.signInTargetUrl).toBe('https://www.mixcloud.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps mixcloud:user extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'mixcloud:user',
                id: 'u1',
                title: 'Upload',
                webpage_url: 'https://www.mixcloud.com/uploads/u1/',
                duration: 600
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.mixcloud.com/uploads/u1/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('mixcloud');
        expect(r.extractorKey).toBe('mixcloud:user');
        expect(spawnPlans).toHaveLength(0);
    });
});
