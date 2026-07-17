/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/renderer/src/App';
import { normalizeAdvancedDownloadDefaults } from '../../src/shared/advancedDownloadSettings';
import { useDownloadStore } from '../../src/store/downloadStore';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../../src/types';

const MOCK_APP_SETTINGS = {
    outputDir: '/downloads',
    maxConcurrentDownloads: 1,
    preferredQuality: 1080,
    uiLocale: '',
    advancedDownloadDefaults: normalizeAdvancedDownloadDefaults(undefined),
    proxyConfigured: false,
    notificationSettings: DEFAULT_NOTIFICATION_SETTINGS
};

function buildApi() {
    const unsub = () => {};
    return {
        getPlatform: () => 'macos' as const,
        getSettings: vi.fn().mockResolvedValue({ ...MOCK_APP_SETTINGS }),
        setSettings: vi.fn().mockResolvedValue({ ...MOCK_APP_SETTINGS }),
        checkSetup: vi.fn().mockResolvedValue({
            ytdlpInstalled: true,
            ffmpegInstalled: true,
            homebrewInstalled: true,
            ytdlpVersion: '2099.01.01',
            ytdlpMeetsMinimumVersion: true,
            ytdlpReady: true
        }),
        installYtdlp: vi.fn(),
        fetchVideoInfo: vi.fn().mockResolvedValue({
            data: {
                id: '1',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                title: 'Vid',
                channel: 'C',
                durationSeconds: 10,
                thumbnailUrl: '',
                formats: [
                    {
                        id: 'f1',
                        ext: 'mp4',
                        resolution: '720p',
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    }
                ]
            }
        }),
        fetchPlaylistInfo: vi.fn(),
        fetchPlaylistInfoStream: vi.fn(async (_url, onEvent) => {
            onEvent({ kind: 'meta', title: 'Mock playlist', channel: 'Creator' });
            onEvent({
                kind: 'entries',
                entries: [
                    {
                        id: 'vid1',
                        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                        title: 'Mock row',
                        author: 'Creator',
                        durationSeconds: 10,
                        thumbnailUrl: '',
                        flatIndex: 0
                    }
                ]
            });
            onEvent({ kind: 'done' });
            return () => {};
        }),
        resolveMetadataUrl: vi.fn().mockResolvedValue({
            kind: 'single',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            candidateMode: 'single',
            authCookiesRecommended: true,
            siteId: 'youtube',
            siteDomain: 'www.youtube.com',
            extractorKey: 'youtube'
        }),
        preparePlaylistOutputDir: vi.fn(),
        startDownload: vi.fn().mockResolvedValue({
            downloadId: 'd1',
            reservedOutputPath: '/downloads/kajo-inflight-d1.mp4'
        }),
        cancelDownload: vi.fn(),
        cleanupDownloadArtifacts: vi.fn().mockResolvedValue(undefined),
        pauseDownload: vi.fn(),
        resumeDownload: vi.fn(),
        selectOutputFolder: vi.fn().mockResolvedValue(null),
        downloadHistory: {
            list: vi.fn().mockResolvedValue([]),
            clear: vi.fn().mockResolvedValue(true),
            total: vi.fn().mockResolvedValue(0)
        },
        getSystemLocale: vi.fn().mockResolvedValue('en-US'),
        openExternal: vi.fn().mockResolvedValue(true),
        onDownloadProgress: vi.fn(() => unsub),
        onDownloadComplete: vi.fn(() => unsub),
        onDownloadError: vi.fn(() => unsub),
        onClipboardUrlDetected: vi.fn(() => unsub),
        onSetupLog: vi.fn(() => unsub),
        onSetupComplete: vi.fn(() => unsub),
        onVideoInfoThumbnail: vi.fn(() => unsub),
        onDownloadStateChange: vi.fn(() => unsub),
        checkDownloadFilePaths: vi.fn().mockResolvedValue([]),
        siteAuth: {
            open: vi.fn().mockResolvedValue({
                ok: true,
                siteKey: 'youtube',
                allowedSuffixes: ['youtube.com']
            }),
            close: vi.fn().mockResolvedValue(true),
            setEmbedBounds: vi.fn().mockResolvedValue(true),
            goBack: vi.fn().mockResolvedValue(true),
            goForward: vi.fn().mockResolvedValue(true),
            reload: vi.fn().mockResolvedValue(true),
            saveAndClose: vi
                .fn()
                .mockResolvedValue({ ok: true, cookieCount: 1, siteKey: 'youtube' }),
            onLoading: vi.fn(() => unsub),
            onUrlState: vi.fn(() => unsub),
            onNavBlocked: vi.fn(() => unsub),
            listSignedSites: vi.fn().mockResolvedValue([]),
            validateSignedSite: vi.fn().mockResolvedValue({ ok: false, error: 'noop' }),
            clearSignedSite: vi.fn().mockResolvedValue({ ok: true }),
            onCookieRefresh: vi.fn(() => unsub)
        },
        search: {
            getUsage: vi.fn().mockResolvedValue(null),
            search: vi.fn().mockResolvedValue({ ok: true, results: [] })
        },
        localFiles: {
            openPath: vi.fn().mockResolvedValue(true),
            revealPath: vi.fn().mockResolvedValue(true)
        }
    };
}

describe('App', () => {
    beforeEach(() => {
        localStorage.clear();
        useDownloadStore.persist.clearStorage();
        useDownloadStore.setState({
            queue: [],
            settings: {
                outputDir: '',
                maxConcurrentDownloads: 1,
                preferredQuality: 1080,
                uiLocale: '',
                advancedDownloadDefaults: normalizeAdvancedDownloadDefaults(undefined),
                proxyConfigured: false,
                notificationSettings: DEFAULT_NOTIFICATION_SETTINGS
            }
        });
        const api = buildApi();
        Object.defineProperty(window, 'api', { configurable: true, writable: true, value: api });
    });

    it('loads workflow when setup ready and fetches video info', async () => {
        const api = window.api as unknown as ReturnType<typeof buildApi>;
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => {
            expect(
                screen.getByPlaceholderText(/video, playlist, or channel URL/i)
            ).toBeInTheDocument();
        });
        const input = screen.getByPlaceholderText(/video, playlist, or channel URL/i);
        await user.type(input, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        await waitFor(() => expect(api.resolveMetadataUrl).toHaveBeenCalled());
        await waitFor(() => expect(api.fetchVideoInfo).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByText('Vid')).toBeInTheDocument());
    });

    it('shows setup gate when yt-dlp not ready', async () => {
        const api = window.api as unknown as ReturnType<typeof buildApi>;
        api.checkSetup.mockResolvedValue({
            ytdlpInstalled: false,
            ffmpegInstalled: false,
            homebrewInstalled: false,
            ytdlpVersion: null,
            ytdlpMeetsMinimumVersion: true,
            ytdlpReady: false
        });
        render(<App />);
        await waitFor(() => {
            expect(screen.getByText(/Setup required/i)).toBeInTheDocument();
        });
    });

    it('shows error when renderer API missing', async () => {
        Object.defineProperty(window, 'api', {
            configurable: true,
            writable: true,
            value: undefined
        });
        render(<App />);
        await waitFor(() => {
            expect(screen.getByText(/Renderer API is unavailable/i)).toBeInTheDocument();
        });
    });

    it('loaded main workflow has no serious axe violations', async () => {
        const { container } = render(<App />);
        await waitFor(() => {
            expect(
                screen.getByPlaceholderText(/video, playlist, or channel URL/i)
            ).toBeInTheDocument();
        });
        const { violations } = await axe(container);
        expect(violations, violations.map((v) => `${v.id}: ${v.description}`).join('\n')).toEqual(
            []
        );
    });
});
