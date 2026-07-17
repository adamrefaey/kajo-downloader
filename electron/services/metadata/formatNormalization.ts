import { type Format, MAX_SUPPORTED_VIDEO_HEIGHT } from '../../../src/types';
import type { YtDlpFormat } from './types';

export function normalizeFormats(
    rawFormats: YtDlpFormat[],
    durationSeconds: number | null
): Format[] {
    const candidates = new Map<
        string,
        {
            format: Format;
            score: number;
            height: number;
            fpsBucket: number;
            audioBitrate: number;
            bitrateKbps: number;
            segmentedProtocol: boolean;
        }
    >();

    const muxedFormats: YtDlpFormat[] = [];
    const videoOnlyFormats: YtDlpFormat[] = [];
    const audioOnlyFormats: YtDlpFormat[] = [];
    for (const format of rawFormats) {
        if (!isSelectableDownloadFormat(format)) {
            continue;
        }
        const hv = hasVideoStream(format);
        const ha = hasAudioStream(format);
        if (hv && ha) {
            muxedFormats.push(format);
            continue;
        }
        if (hv && !ha) {
            videoOnlyFormats.push(format);
            continue;
        }
        !hv && ha && audioOnlyFormats.push(format);
    }

    const prioritizedFormats =
        muxedFormats.length > 0
            ? [...muxedFormats, ...videoOnlyFormats]
            : videoOnlyFormats.length > 0
              ? videoOnlyFormats
              : audioOnlyFormats;

    for (const raw of prioritizedFormats) {
        const id = raw.format_id?.trim();
        if (!id) {
            continue;
        }

        const audioOnly = isAudioOnly(raw);
        const ext = raw.ext?.trim() || 'unknown';
        const resolution = getResolution(raw, audioOnly);
        const height = audioOnly ? 0 : getVideoHeightHintFromRaw(raw, resolution);
        const fpsBucket = audioOnly ? 0 : getFpsBucket(raw);
        const audioBitrate = audioOnly ? getAudioBitrateFromRaw(raw) : 0;
        const bitrateKbps = getFormatBitrateKbps(raw);
        const segmentedProtocol = isSegmentedProtocol(raw.protocol);

        if (!audioOnly && height <= 0) {
            continue;
        }

        if (!audioOnly && height > MAX_SUPPORTED_VIDEO_HEIGHT) {
            continue;
        }

        const qualityKey = audioOnly ? `audio:${audioBitrate}` : `${height}:${fpsBucket}`;

        const isVideoOnlyStream = !audioOnly && hasVideoStream(raw) && !hasAudioStream(raw);
        const videoOnlyBytes = getFilesize(raw, durationSeconds);
        let combinedFilesize = videoOnlyBytes;
        if (isVideoOnlyStream && videoOnlyBytes != null) {
            const pairedAudioBytes = getPairedAudioOnlyFilesizeEstimate(
                audioOnlyFormats,
                durationSeconds,
                height
            );
            if (pairedAudioBytes != null) {
                combinedFilesize = videoOnlyBytes + pairedAudioBytes;
            }
        }

        const normalized: Format = {
            id,
            ext,
            resolution,
            ...(raw.format_note ? { formatNote: raw.format_note } : {}),
            ...(raw.vcodec ? { vcodec: raw.vcodec } : {}),
            ...(raw.acodec ? { acodec: raw.acodec } : {}),
            ...(Number.isFinite(raw.fps) ? { fps: raw.fps } : {}),
            filesize: combinedFilesize,
            ...(isVideoOnlyStream ? { filesizeVideoOnly: videoOnlyBytes } : {}),
            audioOnly,
            ...(audioOnly && audioBitrate > 0 ? { audioBitrateKbps: audioBitrate } : {})
        };

        const score = getFormatScore(normalized, raw, durationSeconds);
        const existing = candidates.get(qualityKey);
        if (
            !existing ||
            isBetterCandidate(
                { format: normalized, score, bitrateKbps, segmentedProtocol },
                existing
            )
        ) {
            candidates.set(qualityKey, {
                format: normalized,
                score,
                height,
                fpsBucket,
                audioBitrate,
                bitrateKbps,
                segmentedProtocol
            });
        }
    }

    return Array.from(candidates.entries())
        .map(([, value]) => value)
        .sort((a, b) => {
            if (a.audioBitrate !== b.audioBitrate) {
                return b.audioBitrate - a.audioBitrate;
            }
            if (a.height !== b.height) {
                return b.height - a.height;
            }
            /* v8 ignore start — qualityKey dedupes height/fps (and audio tiers) before sort */
            if (a.fpsBucket !== b.fpsBucket) {
                return b.fpsBucket - a.fpsBucket;
            }
            return b.score - a.score;
            /* v8 ignore stop */
        })
        .map((value) => value.format);
}

function isSelectableDownloadFormat(format: YtDlpFormat): boolean {
    const ext = (format.ext ?? '').toLowerCase();
    const note = (format.format_note ?? '').toLowerCase();
    const hasVideo = hasVideoStream(format);
    const hasAudio = hasAudioStream(format);

    if (!hasVideo && !hasAudio) {
        return false;
    }

    if (note.includes('storyboard')) {
        return false;
    }

    // Non-media helper formats (e.g. storyboard sprite sheets) are not user-download targets.
    if (ext === 'mhtml' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') {
        return false;
    }

    return true;
}

function hasVideoStream(format: YtDlpFormat): boolean {
    return Boolean(format.vcodec && format.vcodec !== 'none');
}

function hasAudioStream(format: YtDlpFormat): boolean {
    return Boolean(format.acodec && format.acodec !== 'none');
}

function getFormatScore(format: Format, raw: YtDlpFormat, durationSeconds: number | null): number {
    let score = 0;

    const hasVideo = Boolean(format.vcodec && format.vcodec !== 'none');
    const hasAudio = Boolean(format.acodec && format.acodec !== 'none');
    if (hasVideo && hasAudio) {
        // Keep a compatibility preference, but avoid overpowering filesize visibility.
        score += 180;
    }

    score += getExtCompatibilityScore(format.ext);
    score += getVideoCodecCompatibilityScore(format.vcodec);
    score += getAudioCodecCompatibilityScore(format.acodec);
    score += getProtocolScore(raw.protocol);
    if (hasKnownFilesize(raw, durationSeconds)) {
        // Prefer entries that expose size so the UI can present reliable file estimates.
        score += 250;
    }
    score += Math.min(getFilesize(raw, durationSeconds) ?? 0, 500_000_000) / 1_000_000;
    score += (format.fps ?? 0) / 10;

    return score;
}

function isBetterCandidate(
    next: { format: Format; score: number; bitrateKbps: number; segmentedProtocol: boolean },
    current: { format: Format; score: number; bitrateKbps: number; segmentedProtocol: boolean }
): boolean {
    // For stable progress reporting and fewer large jumps, prefer direct-file protocols
    // (e.g. https dash) over segmented streams (m3u8/dash manifests) when quality is equal.
    if (next.segmentedProtocol !== current.segmentedProtocol) {
        return !next.segmentedProtocol;
    }

    // For same quality bucket (height/fps), prefer the highest bitrate stream.
    if (next.bitrateKbps !== current.bitrateKbps) {
        return next.bitrateKbps > current.bitrateKbps;
    }

    if (next.score !== current.score) {
        return next.score > current.score;
    }

    const nextHasSize = Boolean(next.format.filesize && next.format.filesize > 0);
    const currentHasSize = Boolean(current.format.filesize && current.format.filesize > 0);
    /* v8 ignore start — same qualityKey implies identical size estimates in practice */
    if (nextHasSize !== currentHasSize) {
        return nextHasSize;
    }
    /* v8 ignore stop */

    return false;
}

function getExtCompatibilityScore(ext: string): number {
    switch (ext.toLowerCase()) {
        case 'mp4':
            return 400;
        case 'webm':
            return 250;
        case 'mkv':
            return 180;
        default:
            return 80;
    }
}

function getVideoCodecCompatibilityScore(codec?: string): number {
    const value = (codec ?? '').toLowerCase();
    if (!value || value === 'none') {
        return 0;
    }
    if (value.startsWith('avc1') || value.startsWith('h264')) {
        return 240;
    }
    if (value.startsWith('hvc1') || value.startsWith('hev1') || value.startsWith('h265')) {
        return 170;
    }
    if (value.startsWith('vp9')) {
        return 120;
    }
    if (value.startsWith('av01')) {
        return 90;
    }
    return 60;
}

function getAudioCodecCompatibilityScore(codec?: string): number {
    const value = (codec ?? '').toLowerCase();
    if (!value || value === 'none') {
        return 0;
    }
    if (value.startsWith('mp4a') || value.startsWith('aac')) {
        return 120;
    }
    if (value.startsWith('opus')) {
        return 90;
    }
    if (value.startsWith('vorbis')) {
        return 70;
    }
    return 50;
}

function getProtocolScore(protocol?: string): number {
    const value = (protocol ?? '').toLowerCase();
    if (!value) {
        return 0;
    }
    if (value.startsWith('https') || value.startsWith('http')) {
        return 80;
    }
    if (value.includes('m3u8') || value.includes('dash')) {
        return 30;
    }
    return 10;
}

function coercePositiveFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}

function coercePositiveByteSize(value: unknown): number | null {
    const n = coercePositiveFiniteNumber(value);
    return n != null ? Math.floor(n) : null;
}

/**
 * Total bitrate in kbps for size estimates when `filesize` / `filesize_approx` are missing.
 * YouTube often omits `tbr` on progressive muxed formats but still provides `vbr`/`abr`.
 */
function getFormatBitrateKbpsFloatForEstimate(format: YtDlpFormat): number | null {
    const tbr = coercePositiveFiniteNumber(format.tbr);
    if (tbr != null) {
        return tbr;
    }

    const vbr = coercePositiveFiniteNumber(format.vbr);
    const abr = coercePositiveFiniteNumber(format.abr);
    const hv = hasVideoStream(format);
    const ha = hasAudioStream(format);

    if (hv && ha) {
        // For muxed formats, only use vbr (video bitrate includes container overhead).
        // Do not add abr as it over-estimates the combined file size.
        if (vbr != null) {
            return vbr;
        }
        if (abr != null) {
            return abr;
        }
    } else if (hv && vbr != null) {
        return vbr;
    } else if (ha && abr != null) {
        return abr;
    }

    return null;
}

function getFilesize(format: YtDlpFormat, durationSeconds: number | null): number | null {
    const exact = coercePositiveByteSize(format.filesize);
    if (exact != null) {
        return exact;
    }

    // For HLS (m3u8) formats, `filesize_approx` is derived from the manifest's peak BANDWIDTH
    // attribute multiplied by the stream duration. Peak bandwidth can be 5-10x the average encoded
    // bitrate for live recordings, so we skip it here and fall through to the bitrate estimate.
    const protocol = (format.protocol ?? '').toLowerCase();
    const isHls = protocol.includes('m3u8');

    if (!isHls) {
        const approx = coercePositiveByteSize(format.filesize_approx);
        if (approx != null) {
            return approx;
        }
    }

    // Some formats (especially HLS/m3u8 variants) do not expose filesize fields.
    // Fall back to bitrate * duration for a practical estimate.
    const kbps = getFormatBitrateKbpsFloatForEstimate(format);
    if (
        kbps != null &&
        typeof durationSeconds === 'number' &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
    ) {
        const estimated = Math.floor((kbps * 1000 * durationSeconds) / 8);
        if (estimated > 0) {
            return estimated;
        }
    }

    return null;
}

/**
 * Bitrate cap for paired audio by video height — keep aligned with renderer
 * `maxAudioKbpsForVideoHeight` / `pickAudioFormatIdForVideoHeight` / `getDownloadFormatId`.
 */
function maxAudioKbpsForVideoHeightForFilesizeEstimate(height: number): number {
    /* v8 ignore start — only called with video heights > 0 after normalizeFormats gates */
    if (height <= 0) {
        return Number.POSITIVE_INFINITY;
    }
    /* v8 ignore stop */
    if (height <= 480) {
        return 128;
    }
    if (height <= 720) {
        return 160;
    }
    if (height <= 1080) {
        return 192;
    }
    if (height <= 1440) {
        return 256;
    }
    if (height <= 2160) {
        return 320;
    }
    return Number.POSITIVE_INFINITY;
}

function estimateAudioKbpsFromRawForPairing(
    format: YtDlpFormat,
    durationSeconds: number | null
): number {
    const fromMeta = getAudioBitrateFromRaw(format);
    if (fromMeta > 0) {
        return fromMeta;
    }
    const size = getFilesize(format, durationSeconds);
    if (
        size != null &&
        size > 0 &&
        typeof durationSeconds === 'number' &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
    ) {
        return Math.round((size * 8) / durationSeconds / 1000);
    }
    return 0;
}

/**
 * Filesize estimate for the audio stream yt-dlp will pair with this video height
 * (same selection rules as the renderer format-id builder, not "largest audio in manifest").
 */
function getPairedAudioOnlyFilesizeEstimate(
    audioOnlyFormats: YtDlpFormat[],
    durationSeconds: number | null,
    videoHeight: number
): number | null {
    const maxKbps = maxAudioKbpsForVideoHeightForFilesizeEstimate(videoHeight);
    const scored = audioOnlyFormats
        .map((f) => ({ f, kbps: estimateAudioKbpsFromRawForPairing(f, durationSeconds) }))
        .filter((x) => x.kbps > 0)
        .sort((a, b) => b.kbps - a.kbps);
    if (scored.length === 0) {
        return null;
    }
    let picked: YtDlpFormat;
    if (maxKbps === Number.POSITIVE_INFINITY) {
        picked = scored.at(0)?.f as YtDlpFormat;
    } else {
        const capped = scored.filter((x) => x.kbps <= maxKbps);
        picked = (capped.length > 0 ? capped.at(0) : scored.at(0))?.f as YtDlpFormat;
    }
    return getFilesize(picked, durationSeconds);
}

function hasKnownFilesize(format: YtDlpFormat, durationSeconds: number | null): boolean {
    return getFilesize(format, durationSeconds) !== null;
}

function isAudioOnly(format: YtDlpFormat): boolean {
    if (format.vcodec === 'none' && format.acodec && format.acodec !== 'none') {
        return true;
    }

    const resolution = format.resolution ? format.resolution.toLowerCase() : '';
    return resolution.includes('audio');
}

function getResolution(format: YtDlpFormat, audioOnly: boolean): string {
    if (audioOnly) {
        return 'audio only';
    }

    if (format.resolution && format.resolution !== 'none') {
        return format.resolution;
    }

    if (typeof format.height === 'number' && typeof format.width === 'number') {
        return `${format.width}x${format.height}`;
    }

    /* v8 ignore start — height is always a number for surviving video rows after earlier gates */
    if (typeof format.height !== 'number') {
        return '';
    }
    /* v8 ignore stop */
    return `${format.height}p`;
}

function getVideoHeightHintFromRaw(format: YtDlpFormat, fallbackResolution: string): number {
    if (typeof format.height === 'number' && Number.isFinite(format.height)) {
        return format.height;
    }

    return getVideoHeightHint(fallbackResolution);
}

function getFpsBucket(format: YtDlpFormat): number {
    if (typeof format.fps === 'number' && Number.isFinite(format.fps) && format.fps > 0) {
        return Math.round(format.fps);
    }
    return 0;
}

function getAudioBitrateFromRaw(format: YtDlpFormat): number {
    if (typeof format.abr === 'number' && Number.isFinite(format.abr) && format.abr > 0) {
        return Math.round(format.abr);
    }

    const note = format.format_note ?? '';
    const match = note.match(/(\d+)\s*k(?:i)?b(?:it)?\/s/i);
    if (match) {
        // biome-ignore lint/style/noNonNullAssertion: group 1 is present when (\d+) matches
        return Number.parseInt(match[1]!, 10);
    }

    return 0;
}

function getFormatBitrateKbps(format: YtDlpFormat): number {
    const kbps = getFormatBitrateKbpsFloatForEstimate(format);
    return kbps != null ? Math.round(kbps) : 0;
}

function isSegmentedProtocol(protocol?: string): boolean {
    const value = (protocol ?? '').toLowerCase();
    if (!value) {
        return false;
    }
    return value.includes('m3u8') || value.includes('dash');
}

function getVideoHeightHint(resolution: string): number {
    const value = resolution.toLowerCase();
    const match = value.match(/(\d{3,4})p/);
    if (match) {
        // biome-ignore lint/style/noNonNullAssertion: group 1 is present when (\d{3,4})p matches
        return Number.parseInt(match[1]!, 10);
    }

    const dimensions = value.match(/x(\d{3,4})/);
    if (dimensions) {
        // biome-ignore lint/style/noNonNullAssertion: group 1 is present when x(\d{3,4}) matches
        return Number.parseInt(dimensions[1]!, 10);
    }

    return 0;
}
