import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async (args: string[]) => ({
        command: '/fake/yt-dlp',
        args,
        env: { ...process.env }
    }))
}));

vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false,
        getAppPath: () => '/app',
        isReady: () => true
    }
}));

describe('metadata error paths', () => {
    it('fetchMetadata throws when yt-dlp exits with error', async () => {
        vi.doMock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
            spawnYtdlpProcess: vi.fn(() => {
                const child = new EventEmitter() as EventEmitter & {
                    stdout: EventEmitter;
                    stderr: EventEmitter;
                };
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                queueMicrotask(() => {
                    child.stderr.emit('data', Buffer.from('network error'));
                    child.emit('close', 1);
                });
                return child;
            })
        }));
        vi.resetModules();
        const { fetchMetadata } = await import('../electron/services/metadata');
        await expect(fetchMetadata('https://www.youtube.com/watch?v=abc', {})).rejects.toThrow();
    });

    it('fetchMetadata throws on incomplete JSON payload', async () => {
        vi.doMock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
            spawnYtdlpProcess: vi.fn(() => {
                const child = new EventEmitter() as EventEmitter & {
                    stdout: EventEmitter;
                    stderr: EventEmitter;
                };
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                queueMicrotask(() => {
                    const json = JSON.stringify({ id: 'x', title: '', formats: [] });
                    child.stdout.emit('data', Buffer.from(json));
                    child.emit('close', 0);
                });
                return child;
            })
        }));
        vi.resetModules();
        const { fetchMetadata } = await import('../electron/services/metadata');
        await expect(fetchMetadata('https://www.youtube.com/watch?v=abc', {})).rejects.toThrow(
            /incomplete metadata/
        );
    });
});
