/**
 * QA: Top-20 rollout site #12 (SoundCloud) — metadata resolve paths.
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

describe('rollout #12 SoundCloud — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks soundcloud as rollout rank 12', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[11]).toBe('soundcloud');
        expect(listSiteProfilesInRolloutOrder()[11]?.siteId).toBe('soundcloud');
    });

    it('builds static context for track, user root, and sets path', () => {
        const track = buildStaticMetadataResolveContext('https://soundcloud.com/artist/track-name');
        expect(track.siteId).toBe('soundcloud');
        expect(track.candidateMode).toBe('single');
        expect(track.authCookiesRecommended).toBe(true);

        const user = buildStaticMetadataResolveContext('https://soundcloud.com/artist');
        expect(user.siteId).toBe('soundcloud');
        expect(user.candidateMode).toBe('single');

        const set = buildStaticMetadataResolveContext(
            'https://soundcloud.com/artist/sets/mix-2024'
        );
        expect(set.siteId).toBe('soundcloud');
        expect(set.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two tracks', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'soundcloud',
                title: 'Playlist',
                entries: [
                    {
                        id: 't1',
                        title: 'Track 1',
                        url: 'https://soundcloud.com/a/t1',
                        duration: 180
                    },
                    {
                        id: 't2',
                        title: 'Track 2',
                        url: 'https://soundcloud.com/a/t2',
                        duration: 200
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://soundcloud.com/artist/sets/pl';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('soundcloud');
        expect(r.extractorKey).toBe('soundcloud');
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
                extractor_key: 'soundcloud',
                id: 'tid',
                title: 'Song',
                webpage_url: 'https://soundcloud.com/x/y',
                duration: 240
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://soundcloud.com/x/y';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('soundcloud');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://soundcloud.com/private/track';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('soundcloud');
        expect(r.siteDisplayName).toBe('SoundCloud');
        expect(r.signInTargetUrl).toBe('https://soundcloud.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps soundcloud:playlist extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'soundcloud:playlist',
                id: 'pl1',
                title: 'PL',
                webpage_url: 'https://soundcloud.com/u/track-pl1',
                duration: 0
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://soundcloud.com/u/track-pl1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('soundcloud');
        expect(r.extractorKey).toBe('soundcloud:playlist');
        expect(spawnPlans).toHaveLength(0);
    });
});
