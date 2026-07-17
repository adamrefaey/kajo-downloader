import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workerInstances: MockUtilityProcess[] = [];
const forkMock = vi.fn(() => {
    const worker = new MockUtilityProcess();
    workerInstances.push(worker);
    return worker;
});

class MockUtilityProcess extends EventEmitter {
    postMessage = vi.fn();
    kill = vi.fn();
}

vi.mock('electron', () => ({
    utilityProcess: {
        fork: forkMock
    }
}));

vi.mock('../electron/services/ytdlp/ytdlpWorker?modulePath', () => ({
    default: '/fake/ytdlpWorker.js'
}));

vi.mock('../electron/lib/electronProcessContext', () => ({
    electronUserDataPath: () => '/mock-user-data'
}));

describe('ytdlpUtilityProcess worker recovery', () => {
    beforeEach(() => {
        vi.resetModules();
        workerInstances.length = 0;
        forkMock.mockClear();
    });

    afterEach(async () => {
        const mod = await import('../electron/services/ytdlp/ytdlpUtilityProcess');
        await mod.teardownYtdlpWorker({ gracefulTimeoutMs: 0 });
        vi.clearAllMocks();
    });

    it('fails in-flight jobs and recreates worker after unexpected exit', async () => {
        const mod = await import('../electron/services/ytdlp/ytdlpUtilityProcess');
        const first = mod.spawnYtdlpProcess('job-1', '/bin/yt-dlp', ['--version'], {});
        const errors: Error[] = [];
        first.on('error', (err: Error) => errors.push(err));

        expect(workerInstances).toHaveLength(1);
        expect(forkMock).toHaveBeenCalledWith(
            expect.any(String),
            [],
            expect.objectContaining({
                serviceName: 'yt-dlp-worker',
                env: expect.objectContaining({ KAJO_USER_DATA: '/mock-user-data' })
            })
        );

        workerInstances[0]?.emit('exit');
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toBe(mod.YTDLP_WORKER_UNEXPECTED_EXIT_ERROR);
        expect(first.killed).toBe(true);

        const second = mod.spawnYtdlpProcess('job-2', '/bin/yt-dlp', ['--version'], {});
        second.on('error', () => {});
        expect(workerInstances).toHaveLength(2);
        expect(second.killed).toBe(false);
        expect(workerInstances[1]?.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'spawn', id: 'job-2' })
        );
    });
});
