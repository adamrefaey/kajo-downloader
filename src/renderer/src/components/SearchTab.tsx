import { useEffect, useRef, useState } from 'react';
import { getSiteProfileByHostOrUrl } from '../../../shared/siteProfiles';
import type { AddDownloadPayload } from '../../../store/downloadStore';
import { formatIdForYoutubeQualityCaps } from '../utils/playlistBatchPayloads';
import SearchPanel from './SearchPanel';
import styles from './workspaceShared.module.css';

function queueFieldsForUrl(url: string): Partial<AddDownloadPayload> {
    const fields: Partial<AddDownloadPayload> = {};
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host) {
            fields.siteDomain = host;
        }
    } catch {
        // ignore
    }
    const profile = getSiteProfileByHostOrUrl(url);
    if (profile?.siteId) {
        fields.siteId = profile.siteId;
    }
    return fields;
}

interface SearchTabProps {
    outputDir: string;
    prependDownloads: (payloads: AddDownloadPayload[]) => void;
    defaultYoutubeSearchQualityMax: number | null;
    /** When false the panel is hidden but kept mounted to preserve search state. */
    visible: boolean;
}

export default function SearchTab({
    outputDir,
    prependDownloads,
    defaultYoutubeSearchQualityMax,
    visible
}: SearchTabProps): React.JSX.Element {
    const [searchQualityMax, setSearchQualityMax] = useState<number | null>(
        defaultYoutubeSearchQualityMax
    );
    const lastSyncedFavoriteQuality = useRef(defaultYoutubeSearchQualityMax);

    useEffect(() => {
        if (lastSyncedFavoriteQuality.current === defaultYoutubeSearchQualityMax) {
            return;
        }
        lastSyncedFavoriteQuality.current = defaultYoutubeSearchQualityMax;
        setSearchQualityMax(defaultYoutubeSearchQualityMax);
    }, [defaultYoutubeSearchQualityMax]);

    const searchQueueFormatId = formatIdForYoutubeQualityCaps(searchQualityMax, null);

    return (
        <div className={styles.panel} style={!visible ? { display: 'none' } : undefined}>
            <SearchPanel
                onQueueUrl={(url) => {
                    prependDownloads([
                        {
                            ...queueFieldsForUrl(url),
                            url,
                            formatId: searchQueueFormatId,
                            audioOnly: false,
                            videoHeight:
                                searchQualityMax !== null && searchQualityMax > 0
                                    ? searchQualityMax
                                    : undefined,
                            outputDir
                        }
                    ]);
                }}
            />
        </div>
    );
}
