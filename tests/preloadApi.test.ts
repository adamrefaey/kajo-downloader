import type { IpcRenderer } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { createRendererApi, onChannel, onSignalChannel } from '../electron/preloadApi';
import { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from '../src/shared/ipcChannels';

type IpcSubset = Pick<IpcRenderer, 'invoke' | 'on' | 'off'>;
type IpcOnOff = Pick<IpcRenderer, 'on' | 'off'>;

describe('preloadApi', () => {
    it('maps IPC failure envelope to legacy null', async () => {
        const invoke = vi.fn().mockResolvedValue({
            ok: false,
            code: 'invalid_sender',
            message: 'bad sender'
        });
        const on = vi.fn();
        const off = vi.fn();
        const api = createRendererApi({ invoke, on, off } as unknown as IpcSubset, 'darwin');
        await expect(api.getSettings()).resolves.toBeNull();
    });

    it('createRendererApi maps platform and invokes IPC', async () => {
        const invoke = vi.fn(async () => null);
        const on = vi.fn();
        const off = vi.fn();
        const api = createRendererApi({ invoke, on, off } as unknown as IpcSubset, 'darwin');
        expect(api.getPlatform()).toBe('macos');
        expect(
            createRendererApi({ invoke, on, off } as unknown as IpcSubset, 'win32').getPlatform()
        ).toBe('windows');
        expect(
            createRendererApi({ invoke, on, off } as unknown as IpcSubset, 'linux').getPlatform()
        ).toBe('linux');
        expect(
            createRendererApi({ invoke, on, off } as unknown as IpcSubset, 'freebsd').getPlatform()
        ).toBe('unknown');
        await api.fetchVideoInfo('https://youtu.be/x');
        expect(invoke).toHaveBeenCalledWith(
            IPC_INVOKE.downloadFetchVideoInfo,
            'https://youtu.be/x'
        );
        await api.fetchPlaylistInfo('pl');
        await api.resolveMetadataUrl('https://example.com/v');
        expect(invoke).toHaveBeenCalledWith(
            IPC_INVOKE.downloadMetadataResolveUrl,
            'https://example.com/v'
        );
        await api.preparePlaylistOutputDir({ outputDir: '/o', playlistTitle: 'T' });
        await api.prepareChannelOutputDir({
            outputDir: '/o',
            channelTitle: 'MyChan',
            sections: ['videos', 'shorts']
        });
        await api.startDownload({ url: 'u', formatId: 'f', outputDir: '/o' });
        await api.cancelDownload('a');
        await api.cleanupDownloadArtifacts({
            downloadId: 'a',
            outputDir: '/o',
            reservedOutputPath: '/o/x.mp4'
        });
        await api.cleanupEmptyBatchDirs(['/o/playlist-folder']);
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadCleanupEmptyBatchDirs, [
            '/o/playlist-folder'
        ]);
        await api.pauseDownload('a');
        await api.resumeDownload('a');
        await api.checkDownloadFilePaths([{ id: 'a', filePath: '/tmp/a.mp4' }]);
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadCheckFilePaths, [
            { id: 'a', filePath: '/tmp/a.mp4' }
        ]);
        await api.selectOutputFolder();
        await api.getSettings();
        await api.getSystemLocale();
        await api.setSettings({});
        await api.downloadHistory.list({ limit: 10, offset: 0 });
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadHistoryList, {
            limit: 10,
            offset: 0
        });
        await api.downloadHistory.clear();
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadHistoryClear);
        await api.downloadHistory.total();
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadHistoryTotal);
        await api.setProxyProfileUrl({ profileId: 'p', url: 'http://127.0.0.1:9' });
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.settingsProxySetProfileUrl, {
            profileId: 'p',
            url: 'http://127.0.0.1:9'
        });
        await api.checkSetup();
        await api.installYtdlp();
        await api.openExternal('file:///x');
        await api.search.getUsage();
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.searchGetUsage);
        await api.search.search({ query: 'q', platforms: ['youtube'], maxResults: 5 });
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.youtubeSearch, {
            query: 'q',
            platforms: ['youtube'],
            maxResults: 5
        });
        await api.siteAuth.open({ initialUrl: 'https://example.com' });
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.siteAuthOpen, {
            initialUrl: 'https://example.com'
        });
        await api.siteAuth.close();
        await api.siteAuth.setEmbedBounds({ x: 0, y: 0, width: 100, height: 100 });
        await api.siteAuth.goBack();
        await api.siteAuth.goForward();
        await api.siteAuth.reload();
        await api.siteAuth.saveAndClose();
        await api.siteAuth.listSignedSites();
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.siteAuthListSignedSites);
        await api.siteAuth.validateSignedSite('youtube');
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.siteAuthValidateSignedSite, 'youtube');
        await api.siteAuth.clearSignedSite('tiktok');
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.siteAuthClearSignedSite, 'tiktok');
        await api.localFiles.openPath('/tmp/video.mp4');
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.localFilesOpenPath, '/tmp/video.mp4');
        await api.localFiles.revealPath('/tmp/video.mp4');
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.localFilesRevealPath, '/tmp/video.mp4');
        expect(invoke.mock.calls.length).toBeGreaterThan(10);
    });

    it('wrapInvoke propagates underlying invoke rejection through ipcWithTimeout', async () => {
        const err = new Error('ipc transport error');
        const invoke = vi.fn().mockRejectedValue(err);
        const ipcRenderer = { invoke, on: vi.fn(), off: vi.fn() };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
        await expect(api.getSettings()).rejects.toThrow('ipc transport error');
    });

    it('onChannel delivers payload and unsubscribes', () => {
        const handler = vi.fn();
        let registered: ((_event: unknown, payload: unknown) => void) | undefined;
        const ipcRenderer = {
            on: vi.fn((_ch: string, h: (_e: unknown, p: unknown) => void) => {
                registered = h;
            }),
            off: vi.fn()
        };
        const unsub = onChannel(ipcRenderer as unknown as IpcOnOff, 'ch', handler);
        registered?.({}, { a: 1 });
        expect(handler).toHaveBeenCalledWith({ a: 1 });
        unsub();
        expect(ipcRenderer.off).toHaveBeenCalledWith('ch', registered);
    });

    it('registers every IPC listener factory', () => {
        const ipcRenderer = {
            invoke: vi.fn(),
            on: vi.fn(),
            off: vi.fn()
        };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'linux');
        const noop = (): void => {};
        api.onDownloadProgress(noop);
        api.onDownloadComplete(noop);
        api.onDownloadError(noop);
        api.onDownloadStateChange(noop);
        api.onClipboardUrlDetected(noop);
        api.onSetupLog(noop);
        api.onSetupComplete(noop);
        api.onVideoInfoThumbnail(noop);
        api.siteAuth.onLoading(noop);
        api.siteAuth.onUrlState(noop);
        api.siteAuth.onNavBlocked(noop);
        api.siteAuth.onCookieRefresh(noop);
        expect(ipcRenderer.on.mock.calls.length).toBe(12);
    });

    it('fetchPlaylistInfoStream subscribes, forwards events, and cancels', async () => {
        const invoke = vi.fn(async (ch: string) => {
            if (ch === IPC_INVOKE.downloadPlaylistStreamStart) {
                return { streamId: 'sid1' };
            }
            return null;
        });
        let progressHandler: ((e: unknown, p: unknown) => void) | undefined;
        const ipcRenderer = {
            invoke,
            on: vi.fn((ch: string, h: (e: unknown, p: unknown) => void) => {
                if (ch === IPC_MAIN_TO_RENDERER.downloadPlaylistStreamProgress) {
                    progressHandler = h;
                }
            }),
            off: vi.fn()
        };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
        const kinds: string[] = [];
        const cancel = await api.fetchPlaylistInfoStream('https://pl', (evt) => {
            kinds.push(evt.kind);
        });
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadPlaylistStreamStart, 'https://pl');
        progressHandler?.(null, { streamId: 'sid1', kind: 'meta', title: 'T' });
        progressHandler?.(null, { streamId: 'sid1', kind: 'done' });
        expect(kinds).toEqual(['meta', 'done']);
        cancel();
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadPlaylistStreamCancel, 'sid1');
    });

    it('fetchPlaylistInfoStream emits error when start returns IPC failure envelope', async () => {
        const invoke = vi.fn(async () => ({
            ok: false,
            code: 'invalid_sender',
            message: 'envelope fail'
        }));
        const ipcRenderer = { invoke, on: vi.fn(), off: vi.fn() };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
        const events: { kind: string; message?: string }[] = [];
        const cancel = await api.fetchPlaylistInfoStream('https://pl', (evt) => {
            events.push(evt);
        });
        expect(events).toEqual([{ kind: 'error', message: 'envelope fail' }]);
        cancel();
        expect(invoke).not.toHaveBeenCalledWith(
            IPC_INVOKE.downloadPlaylistStreamCancel,
            expect.anything()
        );
    });

    it('fetchPlaylistInfoStream emits error when invoke returns null or non-object', async () => {
        for (const bad of [null, undefined, 42 as unknown]) {
            const invoke = vi.fn(async () => bad);
            const ipcRenderer = { invoke, on: vi.fn(), off: vi.fn() };
            const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
            const kinds: string[] = [];
            const cancel = await api.fetchPlaylistInfoStream('https://pl', (evt) => {
                kinds.push(evt.kind);
            });
            expect(kinds).toEqual(['error']);
            cancel();
        }
    });

    it('fetchPlaylistInfoStream emits error when main returns error payload', async () => {
        const invoke = vi.fn(async () => ({ error: 'not available' }));
        const ipcRenderer = { invoke, on: vi.fn(), off: vi.fn() };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
        const kinds: string[] = [];
        const cancel = await api.fetchPlaylistInfoStream('https://pl', (evt) => {
            kinds.push(evt.kind);
        });
        expect(kinds).toEqual(['error']);
        cancel();
        expect(invoke).not.toHaveBeenCalledWith(
            IPC_INVOKE.downloadPlaylistStreamCancel,
            expect.anything()
        );
    });

    it('fetchPlaylistInfoStream emits error when streamId missing', async () => {
        const invoke = vi.fn(async () => ({ streamId: '' }));
        const ipcRenderer = { invoke, on: vi.fn(), off: vi.fn() };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
        const kinds: string[] = [];
        const cancel = await api.fetchPlaylistInfoStream('https://pl', (evt) => {
            kinds.push(evt.kind);
        });
        expect(kinds).toEqual(['error']);
        cancel();
    });

    it('fetchPlaylistInfoStream ignores progress for other stream ids', async () => {
        const invoke = vi.fn(async () => ({ streamId: 'mine' }));
        let progressHandler: ((e: unknown, p: unknown) => void) | undefined;
        const ipcRenderer = {
            invoke,
            on: vi.fn((_ch: string, h: (e: unknown, p: unknown) => void) => {
                progressHandler = h;
            }),
            off: vi.fn()
        };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
        const kinds: string[] = [];
        const cancel = await api.fetchPlaylistInfoStream('https://pl', (evt) => {
            kinds.push(evt.kind);
        });
        progressHandler?.(null, { streamId: 'other', kind: 'meta', title: 'X' });
        progressHandler?.(null, { streamId: 'mine', kind: 'error', message: 'fail' });
        expect(kinds).toEqual(['error']);
        cancel();
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.downloadPlaylistStreamCancel, 'mine');
    });

    it('siteAuth async methods return error when invoke returns IPC failure envelope', async () => {
        const fail = {
            ok: false as const,
            code: 'invalid_sender' as const,
            message: 'ipc failed'
        };
        const invoke = vi.fn(async () => fail);
        const ipcRenderer = { invoke, on: vi.fn(), off: vi.fn() };
        const api = createRendererApi(ipcRenderer as unknown as IpcSubset, 'darwin');
        await expect(api.siteAuth.open({ initialUrl: 'https://x' })).resolves.toEqual({
            ok: false,
            error: 'ipc failed'
        });
        await expect(api.siteAuth.saveAndClose()).resolves.toEqual({
            ok: false,
            error: 'ipc failed'
        });
        await expect(api.siteAuth.validateSignedSite('youtube')).resolves.toEqual({
            ok: false,
            error: 'ipc failed'
        });
        await expect(api.siteAuth.clearSignedSite('tiktok')).resolves.toEqual({
            ok: false,
            error: 'ipc failed'
        });
    });

    it('onSignalChannel', () => {
        const cb = vi.fn();
        let registered: (() => void) | undefined;
        const ipcRenderer = {
            on: vi.fn((_ch: string, h: () => void) => {
                registered = h;
            }),
            off: vi.fn()
        };
        const unsub = onSignalChannel(
            ipcRenderer as unknown as IpcOnOff,
            IPC_MAIN_TO_RENDERER.setupComplete,
            cb
        );
        registered?.();
        expect(cb).toHaveBeenCalled();
        unsub();
        expect(ipcRenderer.off).toHaveBeenCalledWith(
            IPC_MAIN_TO_RENDERER.setupComplete,
            registered
        );
    });

    it('reportRendererError invokes the renderer error channel fire-and-forget', () => {
        const invoke = vi.fn().mockResolvedValue(undefined);
        const api = createRendererApi(
            { invoke, on: vi.fn(), off: vi.fn() } as unknown as IpcSubset,
            'darwin'
        );
        const payload = { message: 'boom', source: 'renderer', stack: 'Error: boom\n  at foo' };
        api.reportRendererError(payload);
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.appReportRendererError, payload);
    });

    it('reportRendererError swallows invoke rejections silently', async () => {
        const invoke = vi.fn().mockRejectedValue(new Error('ipc failed'));
        const api = createRendererApi(
            { invoke, on: vi.fn(), off: vi.fn() } as unknown as IpcSubset,
            'darwin'
        );
        // Must not throw even when the underlying IPC call rejects
        api.reportRendererError({ message: 'err', source: 'renderer' });
        await new Promise((r) => setTimeout(r, 0));
        expect(invoke).toHaveBeenCalledWith(IPC_INVOKE.appReportRendererError, {
            message: 'err',
            source: 'renderer'
        });
    });
});
