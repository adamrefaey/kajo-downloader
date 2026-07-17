import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Format, MediaLookupResult, PlaylistInfo, VideoInfo } from '../../../../types';
import { isAuthRequiredMediaError } from '../../lib/queueSiteHelpers';

export function useAppControllerMedia(
    videoInfo: VideoInfo | null,
    preferredQuality: number | null
): {
    effectivePreferredQuality: number | null;
    formatsForQualityUi: Format[];
    getMediaLookupErrorMessage: (
        result: MediaLookupResult<VideoInfo> | MediaLookupResult<PlaylistInfo> | null | undefined,
        authReady: boolean,
        mediaLabel: 'video' | 'playlist'
    ) => string;
} {
    // useTranslation makes this a proper React hook so React Compiler (infer mode) compiles it,
    // ensuring getMediaLookupErrorMessage is memoized and has a stable identity across renders.
    const { t } = useTranslation('errors');

    // Free, unrestricted downloader: the user's preferred quality is honoured as-is (no tier cap).
    const effectivePreferredQuality = preferredQuality;

    const formatsForQualityUi = videoInfo ? videoInfo.formats : [];

    const getMediaLookupErrorMessage = useCallback(
        (
            result:
                | MediaLookupResult<VideoInfo>
                | MediaLookupResult<PlaylistInfo>
                | null
                | undefined,
            authReady: boolean,
            mediaLabel: 'video' | 'playlist'
        ): string => {
            if (isAuthRequiredMediaError(result?.error)) {
                if (mediaLabel === 'playlist') {
                    return authReady
                        ? t('mediaAuthPlaylistSignedIn')
                        : t('mediaAuthPlaylistSignedOut');
                }
                return authReady ? t('mediaAuthVideoSignedIn') : t('mediaAuthVideoSignedOut');
            }

            return mediaLabel === 'playlist'
                ? t('metadataPlaylistFailed')
                : t('metadataVideoFailed');
        },
        [t]
    );

    return {
        effectivePreferredQuality,
        formatsForQualityUi,
        getMediaLookupErrorMessage
    };
}
