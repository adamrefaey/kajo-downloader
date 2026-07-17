/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DownloadQueue from '../../src/renderer/src/components/DownloadQueue';
import { useDownloadStore } from '../../src/store/downloadStore';

const batchScrollViewport = { width: 800, height: 480 };

let resizeObserverBackup: typeof ResizeObserver | undefined;

describe('DownloadQueue', () => {
    beforeEach(() => {
        resizeObserverBackup = globalThis.ResizeObserver;
        localStorage.clear();
        useDownloadStore.persist.clearStorage();
        useDownloadStore.setState({ queue: [], settings: useDownloadStore.getState().settings });

        globalThis.ResizeObserver = class MockResizeObserver implements ResizeObserver {
            private readonly callback: ResizeObserverCallback;
            constructor(callback: ResizeObserverCallback) {
                this.callback = callback;
            }
            observe(target: Element): void {
                const { width, height } = batchScrollViewport;
                this.callback(
                    [
                        {
                            target,
                            contentRect: {
                                x: 0,
                                y: 0,
                                width,
                                height,
                                top: 0,
                                left: 0,
                                bottom: height,
                                right: width,
                                toJSON: () => ({})
                            },
                            borderBoxSize: [{ inlineSize: width, blockSize: height }],
                            contentBoxSize: [{ inlineSize: width, blockSize: height }],
                            devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }]
                        } as ResizeObserverEntry
                    ],
                    this
                );
            }
            unobserve(): void {}
            disconnect(): void {}
        };
    });

    afterEach(() => {
        if (resizeObserverBackup) {
            globalThis.ResizeObserver = resizeObserverBackup;
        }
    });

    it('shows visible empty state when queue is empty', () => {
        render(
            <DownloadQueue
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onPauseBatch={vi.fn()}
                onResumeBatch={vi.fn()}
                onRemoveBatch={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByRole('status')).toHaveTextContent(/No downloads yet/i);
    });

    it('renders queue items', () => {
        useDownloadStore.setState({
            queue: [
                {
                    id: 'q1',
                    url: 'u',
                    formatId: 'f',
                    outputDir: '/o',
                    state: 'pending',
                    title: 'Queued video',
                    createdAt: 1
                }
            ]
        });
        render(
            <DownloadQueue
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onPauseBatch={vi.fn()}
                onResumeBatch={vi.fn()}
                onRemoveBatch={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByText('Queued video')).toBeInTheDocument();
    });

    it('groups playlist batch under one heading', () => {
        useDownloadStore.setState({
            queue: [
                {
                    id: 'v1',
                    url: 'https://youtu.be/a',
                    formatId: 'f',
                    outputDir: '/o',
                    state: 'pending',
                    title: 'First',
                    batchGroupId: 'batch-1',
                    playlistTitle: 'Cool playlist',
                    createdAt: 2
                },
                {
                    id: 'v2',
                    url: 'https://youtu.be/b',
                    formatId: 'f',
                    outputDir: '/o',
                    state: 'pending',
                    title: 'Second',
                    batchGroupId: 'batch-1',
                    playlistTitle: 'Cool playlist',
                    createdAt: 1
                }
            ]
        });
        render(
            <DownloadQueue
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onPauseBatch={vi.fn()}
                onResumeBatch={vi.fn()}
                onRemoveBatch={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByText('Cool playlist')).toBeInTheDocument();
        expect(screen.getByText('First')).toBeInTheDocument();
        expect(screen.getByText('Second')).toBeInTheDocument();
    });
});
