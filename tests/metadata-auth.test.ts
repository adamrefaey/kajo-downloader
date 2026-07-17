import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SpawnPlan {
    stdout?: string;
    stderr?: string;
    exitCode: number | null;
}

const spawnPlans: SpawnPlan[] = [];
const spawnCalls: Array<{ command: string; args: string[] }> = [];

vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false,
        getAppPath: () => '/app',
        isReady: () => true
    }
}));

vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: vi.fn((_id: string, command: string, args: string[]) => {
        spawnCalls.push({ command, args });

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

describe('metadata auth cookie gating', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        spawnCalls.length = 0;
        vi.resetModules();
    });

    it('does not pass cookies when no embedded site session file exists', async () => {
        spawnPlans.push({
            stderr: 'ERROR: Private video. Sign in if you have been granted access to this video.',
            exitCode: 1
        });

        const { resolveYoutubeCookieArgvForDownload } = await import(
            '../electron/services/metadata'
        );
        const argv = await resolveYoutubeCookieArgvForDownload(
            'https://www.youtube.com/watch?v=abc123',
            {
                getSiteCookiesFilePath: async () => null
            }
        );

        expect(argv).toEqual([]);
        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0]?.args).not.toContain('--cookies');
        expect(spawnCalls[0]?.args).not.toContain('--cookies-from-browser');
    });

    it('uses embedded site cookie file when materialized path is returned', async () => {
        spawnPlans.push({ stdout: '', stderr: '', exitCode: 0 });

        const { resolveYoutubeCookieArgvForDownload } = await import(
            '../electron/services/metadata'
        );
        const argv = await resolveYoutubeCookieArgvForDownload(
            'https://www.youtube.com/watch?v=abc123',
            {
                getSiteCookiesFilePath: async () => '/tmp/site-youtube.cookies.txt'
            }
        );

        expect(argv).toContain('--cookies');
        expect(argv).toContain('/tmp/site-youtube.cookies.txt');
        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0]?.args).not.toContain('--cookies-from-browser');
    });
});
