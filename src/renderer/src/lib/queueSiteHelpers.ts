import { getSiteProfileByHostOrUrl } from '../../../shared/siteProfiles';
import type { AddDownloadPayload } from '../../../store/downloadStore';
import type { MetadataResolveResult } from '../../../types';

export function isAuthRequiredMediaError(message: string | null | undefined): boolean {
    const normalized = (message ?? '').toLowerCase();
    return (
        normalized.includes('private video') ||
        normalized.includes('sign in to confirm your age') ||
        normalized.includes("sign in to confirm you're not a bot") ||
        normalized.includes('use --cookies-from-browser or --cookies') ||
        normalized.includes('members-only') ||
        normalized.includes('subscriber-only') ||
        normalized.includes('needs_auth')
    );
}

export function queueSiteFieldsFromMediaUrl(
    mediaUrl: string,
    options?: { extractorKey?: string | undefined; authRequired?: boolean | undefined } | undefined
): Partial<Pick<AddDownloadPayload, 'siteId' | 'siteDomain' | 'extractorKey' | 'authRequired'>> {
    const fields: Partial<
        Pick<AddDownloadPayload, 'siteId' | 'siteDomain' | 'extractorKey' | 'authRequired'>
    > = {};
    try {
        const host = new URL(mediaUrl).hostname.toLowerCase();
        if (host) {
            fields.siteDomain = host;
        }
    } catch {
        // ignore
    }
    const profile = getSiteProfileByHostOrUrl(mediaUrl);
    if (profile?.siteId) {
        fields.siteId = profile.siteId;
    }
    if (options?.extractorKey) {
        fields.extractorKey = options.extractorKey;
    }
    if (options?.authRequired !== undefined) {
        fields.authRequired = options.authRequired;
    }
    return fields;
}

/** Prefer IPC resolve context (extractor + siteId from yt-dlp JSON) when enqueueing. */
export function queueSiteFieldsFromResolve(
    resolve: MetadataResolveResult | null,
    mediaUrl: string,
    options?: { extractorKey?: string | undefined } | undefined
): Partial<Pick<AddDownloadPayload, 'siteId' | 'siteDomain' | 'extractorKey' | 'authRequired'>> {
    const base = queueSiteFieldsFromMediaUrl(mediaUrl, {
        extractorKey: options?.extractorKey,
        authRequired: resolve?.kind === 'auth-required'
    });
    if (!resolve) {
        return base;
    }
    if (resolve.siteId) {
        base.siteId = resolve.siteId;
    }
    if (resolve.siteDomain) {
        base.siteDomain = resolve.siteDomain;
    }
    if (resolve.extractorKey) {
        base.extractorKey = resolve.extractorKey;
    }
    if (options?.extractorKey) {
        base.extractorKey = options.extractorKey;
    }
    if (resolve.kind === 'auth-required') {
        base.authRequired = true;
    }
    return base;
}
