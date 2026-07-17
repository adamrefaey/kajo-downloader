import type { MediaCandidate, YoutubeChannelSectionTab } from '../../../../types';
import { multiVideoPickerEntryKey } from '../multiVideoPickerEntryKey';

export function trimSectionDomIds(entryKey: string): { panelId: string; toggleId: string } {
    const safe = entryKey.replace(/[^a-zA-Z0-9_-]/g, '-');
    return { panelId: `mvp-trim-panel-${safe}`, toggleId: `mvp-trim-toggle-${safe}` };
}

export function rowSelectionKey(
    entry: MediaCandidate,
    tab: YoutubeChannelSectionTab | null
): string {
    const base = multiVideoPickerEntryKey(entry);
    return tab ? `${tab}:${base}` : base;
}
