import type { MediaCandidate } from '../../../types';

/** Stable row id for batch picker state (virtual list + trim maps). */
export function multiVideoPickerEntryKey(entry: MediaCandidate): string {
    return `${entry.flatIndex}:${entry.id}`;
}
