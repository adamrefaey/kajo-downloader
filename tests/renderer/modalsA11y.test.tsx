/** @vitest-environment jsdom */

import { render } from '@testing-library/react';
import type { AxeResults } from 'axe-core';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DownloadHistoryModal from '../../src/renderer/src/components/DownloadHistoryModal';
import MultiVideoPickerModal from '../../src/renderer/src/components/MultiVideoPickerModal';
import SettingsModal from '../../src/renderer/src/components/SettingsModal';
import SiteSessionsModal from '../../src/renderer/src/components/SiteSessionsModal';
import YoutubeWatchPlaylistForkModal from '../../src/renderer/src/components/YoutubeWatchPlaylistForkModal';
import { normalizeAdvancedDownloadDefaults } from '../../src/shared/advancedDownloadSettings';
import { DEFAULT_NOTIFICATION_SETTINGS, type MediaCandidate } from '../../src/types';

const SAMPLE_ENTRIES: MediaCandidate[] = [
    {
        id: '1',
        url: 'https://www.youtube.com/watch?v=a',
        title: 'First clip',
        author: 'Creator',
        durationSeconds: 10,
        thumbnailUrl: '',
        flatIndex: 0
    },
    {
        id: '2',
        url: 'https://www.youtube.com/watch?v=b',
        title: 'Second clip',
        author: 'Creator',
        durationSeconds: 20,
        thumbnailUrl: '',
        flatIndex: 1
    }
];

function formatAxeViolations(violations: AxeResults['violations']): string {
    return violations
        .map(
            (v) =>
                `${v.id}: ${v.description}\n` +
                v.nodes.map((n) => `  - ${n.html?.slice(0, 120) ?? ''}`).join('\n')
        )
        .join('\n---\n');
}

describe('modal a11y (axe)', () => {
    afterEach(() => {
        Reflect.deleteProperty(window, 'api');
    });

    it('SettingsModal has no serious axe violations when open', async () => {
        const { container } = render(
            <SettingsModal
                open
                onClose={vi.fn()}
                outputDir="/tmp/kajo-out"
                onSelectOutputFolder={vi.fn()}
                preferredQuality={1080}
                onPreferredQualityChange={vi.fn()}
                maxConcurrentDownloads={2}
                onMaxConcurrentDownloadsChange={vi.fn()}
                concurrentOptions={[
                    { value: 1, label: '1' },
                    { value: 2, label: '2' }
                ]}
                uiLocale="en"
                onUiLocaleChange={vi.fn()}
                proxyConfigured={false}
                onSaveProxyUrl={vi.fn()}
                advancedDownloadDefaults={normalizeAdvancedDownloadDefaults(undefined)}
                customFilenameTemplate={undefined}
                onPatchAdvancedDownloadDefaults={vi.fn()}
                onCustomFilenameTemplateChange={vi.fn()}
                notificationSettings={DEFAULT_NOTIFICATION_SETTINGS}
                onPatchNotificationSettings={vi.fn()}
            />
        );
        const result = await axe(container);
        expect(result.violations, formatAxeViolations(result.violations)).toEqual([]);
    });

    it('YoutubeWatchPlaylistForkModal has no serious axe violations when open', async () => {
        const { container } = render(
            <YoutubeWatchPlaylistForkModal
                open
                onClose={vi.fn()}
                onChooseVideo={vi.fn()}
                onChoosePlaylist={vi.fn()}
            />
        );
        const { violations } = await axe(container);
        expect(violations, formatAxeViolations(violations)).toEqual([]);
    });

    it('SiteSessionsModal has no serious axe violations when open', async () => {
        const { container } = render(
            <SiteSessionsModal open onClose={vi.fn()} onOpenSiteAuth={vi.fn()} />
        );
        const { violations } = await axe(container);
        expect(violations, formatAxeViolations(violations)).toEqual([]);
    });

    it('MultiVideoPickerModal has no serious axe violations when open', async () => {
        const { container } = render(
            <MultiVideoPickerModal
                open
                onClose={vi.fn()}
                collectionTitle="Test playlist"
                entries={SAMPLE_ENTRIES}
                numberPlaylistItems={false}
                onNumberPlaylistItemsChange={vi.fn()}
                onConfirm={vi.fn()}
            />
        );
        const { violations } = await axe(container);
        expect(violations, formatAxeViolations(violations)).toEqual([]);
    });

    it('DownloadHistoryModal has no serious axe violations when open', async () => {
        window.api = {
            downloadHistory: {
                list: vi.fn().mockResolvedValue([]),
                total: vi.fn().mockResolvedValue(0),
                clear: vi.fn().mockResolvedValue(true)
            }
        } as unknown as Window['api'];
        const { container } = render(
            <DownloadHistoryModal
                open
                onClose={vi.fn()}
                outputDir="/tmp/kajo-out"
                preferredQuality={1080}
                prependDownloads={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const { violations } = await axe(container);
        expect(violations, formatAxeViolations(violations)).toEqual([]);
    });
});
