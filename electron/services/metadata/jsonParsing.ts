import { z } from 'zod';
import type { YtDlpMetadata, YtDlpPlaylistMetadata } from './types';

const ytDlpFormatSchema = z
    .object({
        format_id: z.string().optional(),
        ext: z.string().optional(),
        resolution: z.string().optional(),
        format_note: z.string().optional(),
        vcodec: z.string().optional(),
        acodec: z.string().optional(),
        fps: z.number().nullable().optional(),
        tbr: z.number().nullable().optional(),
        vbr: z.number().nullable().optional(),
        filesize: z.number().nullable().optional(),
        filesize_approx: z.number().nullable().optional(),
        width: z.number().nullable().optional(),
        height: z.number().nullable().optional(),
        abr: z.number().nullable().optional(),
        protocol: z.string().optional()
    })
    .passthrough();

const ytDlpMetadataSchema = z
    .object({
        extractor: z.string().optional(),
        extractor_key: z.string().optional(),
        id: z.string().optional(),
        title: z.string().optional(),
        channel: z.string().optional(),
        uploader: z.string().optional(),
        duration: z.number().nullable().optional(),
        thumbnail: z.string().optional(),
        thumbnails: z
            .array(
                z.object({
                    url: z.string().optional(),
                    width: z.number().nullable().optional(),
                    height: z.number().nullable().optional()
                })
            )
            .optional(),
        availability: z.string().nullable().optional(),
        webpage_url: z.string().optional(),
        original_url: z.string().optional(),
        formats: z.array(ytDlpFormatSchema).optional()
    })
    .passthrough();

const ytDlpPlaylistEntrySchema = z
    .object({
        id: z.string().optional(),
        title: z.string().optional(),
        url: z.string().optional(),
        webpage_url: z.string().optional(),
        original_url: z.string().optional(),
        availability: z.string().nullable().optional(),
        channel: z.string().optional(),
        uploader: z.string().optional(),
        duration: z.number().nullable().optional(),
        filesize: z.number().nullable().optional(),
        filesize_approx: z.number().nullable().optional(),
        thumbnail: z.string().optional(),
        thumbnails: z
            .array(
                z.object({
                    url: z.string().optional(),
                    width: z.number().nullable().optional(),
                    height: z.number().nullable().optional()
                })
            )
            .optional(),
        ie_key: z.string().optional()
    })
    .passthrough();

const ytDlpPlaylistMetadataSchema = z
    .object({
        extractor: z.string().optional(),
        extractor_key: z.string().optional(),
        id: z.string().optional(),
        title: z.string().optional(),
        playlist_title: z.string().optional(),
        channel: z.string().optional(),
        uploader: z.string().optional(),
        entries: z.array(ytDlpPlaylistEntrySchema).optional()
    })
    .passthrough();

export function parseMetadataJson(stdout: string): YtDlpMetadata {
    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const candidate = lines[i] as string;
        let raw: unknown;
        try {
            raw = JSON.parse(candidate);
        } catch {
            // Ignore non-JSON lines and keep scanning.
            continue;
        }
        const result = ytDlpMetadataSchema.safeParse(raw);
        if (result.success && (result.data.id || result.data.title)) {
            return result.data as YtDlpMetadata;
        }
    }

    throw new Error('Failed to parse yt-dlp metadata output');
}

export function parsePlaylistMetadataJson(stdout: string): YtDlpPlaylistMetadata {
    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const candidate = lines[i] as string;
        let raw: unknown;
        try {
            raw = JSON.parse(candidate);
        } catch {
            // Ignore non-JSON lines and keep scanning.
            continue;
        }
        const result = ytDlpPlaylistMetadataSchema.safeParse(raw);
        if (result.success) {
            if (Array.isArray(result.data.entries)) {
                return result.data as YtDlpPlaylistMetadata;
            }
            if (result.data.id?.trim() && result.data.title?.trim()) {
                return {
                    ...result.data,
                    entries: []
                } as YtDlpPlaylistMetadata;
            }
        }
    }

    throw new Error('Failed to parse yt-dlp playlist metadata output');
}

export function coercePositiveByteCount(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }
    const n = Math.floor(value);
    return n > 0 ? n : undefined;
}
