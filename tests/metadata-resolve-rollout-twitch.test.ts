/**
 * QA: Top-20 rollout site #6 (Twitch) — metadata resolve paths.
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

describe('rollout #6 Twitch — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks twitch as rollout rank 6', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[5]).toBe('twitch');
        expect(listSiteProfilesInRolloutOrder()[5]?.siteId).toBe('twitch');
    });

    it('builds static context for vod, channel, list hint, and mobile host', () => {
        const vod = buildStaticMetadataResolveContext('https://www.twitch.tv/videos/1234567890');
        expect(vod.siteId).toBe('twitch');
        expect(vod.candidateMode).toBe('single');
        expect(vod.authCookiesRecommended).toBe(true);

        const channel = buildStaticMetadataResolveContext('https://www.twitch.tv/shroud');
        expect(channel.siteId).toBe('twitch');
        expect(channel.candidateMode).toBe('single');

        const listHint = buildStaticMetadataResolveContext('https://www.twitch.tv/foo?list=abc');
        expect(listHint.siteId).toBe('twitch');
        expect(listHint.candidateMode).toBe('multi');

        const mobile = buildStaticMetadataResolveContext('https://m.twitch.tv/foo');
        expect(mobile.siteId).toBe('twitch');
        expect(mobile.candidateMode).toBe('single');
    });

    it('returns multi when flat probe lists two VOD entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'twitch:vod',
                title: 'Collection',
                entries: [
                    {
                        id: 'v1',
                        title: 'Past broadcast A',
                        url: 'https://www.twitch.tv/videos/111',
                        duration: 3600
                    },
                    {
                        id: 'v2',
                        title: 'Past broadcast B',
                        url: 'https://www.twitch.tv/videos/222',
                        duration: 1800
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.twitch.tv/foo?list=col';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('twitch');
        expect(r.extractorKey).toBe('twitch:vod');
        expect(r.entryCount).toBe(2);
        expect(r.candidates).toHaveLength(2);
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns single from single-video probe', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: Unsupported URL'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'twitch:vod',
                id: '999',
                title: 'Highlight',
                webpage_url: 'https://www.twitch.tv/videos/999',
                duration: 120
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.twitch.tv/videos/999';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('twitch');
        expect(r.extractorKey).toBe('twitch:vod');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.twitch.tv/videos/sub_only';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('twitch');
        expect(r.siteDisplayName).toBe('Twitch');
        expect(r.signInTargetUrl).toBe('https://www.twitch.tv');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps twitch:clips extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'twitch:clips',
                id: 'ClipName',
                title: 'Funny moment',
                webpage_url: 'https://clips.twitch.tv/ClipName',
                duration: 30
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://clips.twitch.tv/ClipName';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('twitch');
        expect(r.extractorKey).toBe('twitch:clips');
        expect(spawnPlans).toHaveLength(0);
    });
});
