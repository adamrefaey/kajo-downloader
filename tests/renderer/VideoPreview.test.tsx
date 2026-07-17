/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VideoPreview from '../../src/renderer/src/components/VideoPreview';

describe('VideoPreview', () => {
    it('renders title and duration', () => {
        render(
            <VideoPreview
                videoInfo={{
                    id: '1',
                    url: 'u',
                    title: 'Hello',
                    channel: 'Ch',
                    durationSeconds: 125,
                    thumbnailUrl: '',
                    formats: []
                }}
            />
        );
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('2:05')).toBeInTheDocument();
    });

    it('formats hours in duration', () => {
        render(
            <VideoPreview
                videoInfo={{
                    id: '1',
                    url: 'u',
                    title: 'Long',
                    channel: 'C',
                    durationSeconds: 3665,
                    thumbnailUrl: '',
                    formats: []
                }}
            />
        );
        expect(screen.getByText('1:01:05')).toBeInTheDocument();
    });

    it('renders thumbnail when present', () => {
        render(
            <VideoPreview
                videoInfo={{
                    id: '1',
                    url: 'u',
                    title: 'T',
                    channel: 'C',
                    durationSeconds: 0,
                    thumbnailUrl: 'https://example.com/t.jpg',
                    formats: []
                }}
            />
        );
        expect(screen.getByRole('img', { name: /Thumbnail for T/i })).toHaveAttribute(
            'src',
            'https://example.com/t.jpg'
        );
    });
});
