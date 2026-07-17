import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
const postedMessages: unknown[] = [];

type FakeChild = EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
};

function makeChild(pid: number): FakeChild {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = pid;
    child.killed = false;
    child.kill = vi.fn(() => {
        child.killed = true;
        return true;
    });
    return child;
}

vi.mock('node:child_process', () => ({
    spawn: (...args: unknown[]) => spawnMock(...args)
}));

describe('ytdlpWorker same-ID spawn', () => {
    let parentPortEmitter: EventEmitter;

    beforeAll(async () => {
        parentPortEmitter = new EventEmitter();
        const parentPort = Object.assign(parentPortEmitter, {
            postMessage: (msg: unknown) => postedMessages.push(msg)
        });
        Object.defineProperty(process, 'parentPort', {
            value: parentPort,
            configurable: true,
            writable: true
        });

        await import('../electron/services/ytdlp/ytdlpWorker');
    });

    afterAll(() => {
        Object.defineProperty(process, 'parentPort', {
            value: undefined,
            configurable: true,
            writable: true
        });
    });

    beforeEach(() => {
        spawnMock.mockReset();
        postedMessages.length = 0;
    });

    it('kills an existing child before registering a new spawn with the same id', () => {
        const first = makeChild(10_001);
        const second = makeChild(10_002);
        spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

        const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

        parentPortEmitter.emit('message', {
            data: {
                type: 'spawn',
                id: 'job-a',
                command: '/bin/yt-dlp',
                args: [],
                env: {}
            }
        });

        expect(spawnMock).toHaveBeenCalledTimes(1);
        expect(postedMessages).toContainEqual({ type: 'pid', id: 'job-a', pid: 10_001 });

        parentPortEmitter.emit('message', {
            data: {
                type: 'spawn',
                id: 'job-a',
                command: '/bin/yt-dlp',
                args: ['--version'],
                env: {}
            }
        });

        expect(spawnMock).toHaveBeenCalledTimes(2);
        expect(killSpy).toHaveBeenCalledWith(-10_001, 'SIGTERM');
        expect(postedMessages).toContainEqual({ type: 'pid', id: 'job-a', pid: 10_002 });

        first.emit('close', 1);
        expect(postedMessages).not.toContainEqual({ type: 'close', id: 'job-a', exitCode: 1 });

        killSpy.mockRestore();
    });
});
