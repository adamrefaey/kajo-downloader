import type { TFunction } from 'i18next';
import type { VideoInfo } from '../../../../types';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import { multilineRowIsDownloadReady } from '../multilinePreview.types';

export type AppWorkflowStateTextInput = {
    t: TFunction;
    showSetupGate: boolean;
    error: string | null;
    isAuthGate: boolean;
    isBatchUrl: boolean;
    isYoutubeChannelBatch: boolean;
    videoInfo: VideoInfo | null;
    trimmedUrl: string;
    multilinePreviewRows: MultilinePreviewRowState[];
};

export function getAppWorkflowStateText({
    t,
    showSetupGate,
    error,
    isAuthGate,
    isBatchUrl,
    isYoutubeChannelBatch,
    videoInfo,
    trimmedUrl,
    multilinePreviewRows
}: AppWorkflowStateTextInput): string {
    if (showSetupGate) {
        return t('app:workflowSetupRequired');
    }
    if (error) {
        return t('app:workflowError', { message: error });
    }
    if (isAuthGate) {
        return t('app:workflowSiteAuthRequired');
    }
    if (multilinePreviewRows.length >= 2) {
        const anyLoading = multilinePreviewRows.some((r) => r.resolvePending || r.fetchPending);
        const allReady =
            multilinePreviewRows.length > 0 &&
            multilinePreviewRows.every(multilineRowIsDownloadReady);
        if (anyLoading) {
            return t('app:workflowMultilineLoading');
        }
        if (allReady) {
            return t('app:workflowMultilineReady');
        }
        return t('app:workflowMultilinePartial');
    }
    if (isBatchUrl) {
        return isYoutubeChannelBatch
            ? t('app:workflowChannelPickerHint')
            : t('app:workflowPlaylistReady');
    }
    if (videoInfo) {
        return t('app:workflowVideoLoaded');
    }
    if (trimmedUrl) {
        return t('app:workflowWaitingUrl');
    }
    return t('app:workflowWaitingMediaUrl');
}
