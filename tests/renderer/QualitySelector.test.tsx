/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QualitySelector from '../../src/renderer/src/components/QualitySelector';

describe('QualitySelector', () => {
    it('changes format on select', async () => {
        const onChangeFormat = vi.fn();
        const user = userEvent.setup();
        render(
            <QualitySelector
                formats={[
                    {
                        id: 'a',
                        ext: 'mp4',
                        resolution: '720p',
                        filesize: 1024,
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    },
                    {
                        id: 'b',
                        ext: 'mp4',
                        resolution: '480p',
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    }
                ]}
                selectedFormatId="a"
                audioOnly={false}
                onChangeFormat={onChangeFormat}
                onToggleAudioOnly={vi.fn()}
            />
        );
        await user.click(screen.getByLabelText(/Preferred format/i));
        await user.click(screen.getByRole('option', { name: '480p' }));
        expect(onChangeFormat).toHaveBeenCalledWith('b');
    });

    it('omits zero filesize from label', async () => {
        const user = userEvent.setup();
        render(
            <QualitySelector
                formats={[
                    {
                        id: 'z',
                        ext: 'mp4',
                        resolution: '480p',
                        filesize: 0,
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    }
                ]}
                selectedFormatId="z"
                audioOnly={false}
                onChangeFormat={vi.fn()}
                onToggleAudioOnly={vi.fn()}
            />
        );
        await user.click(screen.getByLabelText(/Preferred format/i));
        expect(screen.getByRole('option', { name: '480p' })).toBeInTheDocument();
    });

    it('labels audio-only format', async () => {
        const user = userEvent.setup();
        render(
            <QualitySelector
                formats={[
                    {
                        id: 'ao',
                        ext: 'm4a',
                        resolution: 'audio only',
                        audioOnly: true,
                        acodec: 'aac',
                        vcodec: 'none'
                    }
                ]}
                selectedFormatId="ao"
                audioOnly
                onChangeFormat={vi.fn()}
                onToggleAudioOnly={vi.fn()}
            />
        );
        await user.click(screen.getByLabelText(/Preferred format/i));
        expect(screen.getByRole('option', { name: /audio/i })).toBeInTheDocument();
    });

    it('toggles audio-only and filters formats', async () => {
        const onToggleAudioOnly = vi.fn();
        const user = userEvent.setup();
        render(
            <QualitySelector
                formats={[
                    {
                        id: 'v720',
                        ext: 'mp4',
                        resolution: '720p',
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    },
                    {
                        id: 'ao',
                        ext: 'm4a',
                        resolution: 'audio only',
                        audioOnly: true,
                        acodec: 'aac',
                        vcodec: 'none'
                    }
                ]}
                selectedFormatId="v720"
                audioOnly={false}
                onChangeFormat={vi.fn()}
                onToggleAudioOnly={onToggleAudioOnly}
            />
        );
        await user.click(screen.getByLabelText(/Download audio only/i));
        expect(onToggleAudioOnly).toHaveBeenCalledWith(true);
    });

    it('shows only audio formats when audio-only is enabled', async () => {
        const user = userEvent.setup();
        render(
            <QualitySelector
                formats={[
                    {
                        id: 'v720',
                        ext: 'mp4',
                        resolution: '720p',
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    },
                    {
                        id: 'ao',
                        ext: 'm4a',
                        resolution: 'audio only',
                        audioOnly: true,
                        acodec: 'aac',
                        vcodec: 'none'
                    }
                ]}
                selectedFormatId="ao"
                audioOnly
                onChangeFormat={vi.fn()}
                onToggleAudioOnly={vi.fn()}
            />
        );
        await user.click(screen.getByLabelText(/Preferred format/i));
        expect(screen.getByRole('option', { name: /audio/i })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: '720p' })).toBeNull();
    });

    it('includes fps and humanized size in format label', async () => {
        const user = userEvent.setup();
        const fifteenMiB = 15 * 1024 * 1024;
        render(
            <QualitySelector
                formats={[
                    {
                        id: 'hq',
                        ext: 'mp4',
                        resolution: '1080p',
                        fps: 60,
                        filesize: fifteenMiB,
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    }
                ]}
                selectedFormatId="hq"
                audioOnly={false}
                onChangeFormat={vi.fn()}
                onToggleAudioOnly={vi.fn()}
            />
        );
        await user.click(screen.getByLabelText(/Preferred format/i));
        const opt = screen.getByRole('option', { name: /1080p/ });
        expect(opt.textContent).toContain('60fps');
        expect(opt.textContent).toContain('15 MB');
    });

    it('disables select and shows fetch hint when there are no formats', () => {
        render(
            <QualitySelector
                formats={[]}
                selectedFormatId=""
                audioOnly={false}
                onChangeFormat={vi.fn()}
                onToggleAudioOnly={vi.fn()}
            />
        );
        const trigger = screen.getByLabelText(/Preferred format/i);
        expect(trigger).toBeDisabled();
        expect(trigger).toHaveTextContent(/Fetch video info first/i);
    });

    it('shows choose-format placeholder when formats exist but none selected', () => {
        render(
            <QualitySelector
                formats={[
                    {
                        id: 'only',
                        ext: 'mp4',
                        resolution: '720p',
                        vcodec: 'avc1',
                        acodec: 'mp4a'
                    }
                ]}
                selectedFormatId=""
                audioOnly={false}
                onChangeFormat={vi.fn()}
                onToggleAudioOnly={vi.fn()}
            />
        );
        const trigger = screen.getByLabelText(/Preferred format/i);
        expect(trigger).not.toBeDisabled();
        expect(trigger).toHaveTextContent(/Choose format/i);
    });
});
