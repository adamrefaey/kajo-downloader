/**
 * Mustache-style {{var}} filename template service.
 *
 * Two formats:
 *   - Display ({{var}}) — used in Settings UI for editing/preview.
 *   - yt-dlp (%(var)s) — stored in settings, passed to download engine.
 *
 * `toYtdlpTemplate()` converts display → yt-dlp format.
 * `renderFilenameTemplate()` evaluates display format with sample data for preview.
 */

export interface TemplateContext {
    title: string;
    channel: string;
    uploadDate: string; // YYYYMMDD or empty
    platform: string;
    duration: string; // HH:MM:SS or empty
    resolution: string; // e.g. "1080p" or empty
    ext: string; // without leading dot
    id: string;
}

export const BUILTIN_TEMPLATES: Record<string, string> = {
    default: '{{title}}',
    detailed: '{{channel}} - {{title}} [{{resolution}}]',
    dated: '{{uploadDate}} - {{title}}',
    organized: '{{channel}}/{{uploadDate}} - {{title}}'
};

/** Map our {{var}} names to yt-dlp %(field)s names. */
const VAR_TO_YTDLP: Record<string, string> = {
    title: 'title',
    channel: 'uploader',
    uploadDate: 'upload_date',
    platform: 'extractor',
    duration: 'duration_string',
    resolution: 'height',
    ext: 'ext',
    id: 'id'
};

/**
 * Convert a display template ({{var}}) to a yt-dlp format string (%(var)s).
 * Unknown {{vars}} are left as-is.
 */
export function toYtdlpTemplate(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        const ytKey = VAR_TO_YTDLP[key];
        if (!ytKey) return `{{${key}}}`; // leave unknown vars
        // Special case: resolution needs "p" suffix appended
        if (key === 'resolution') return `%(height)sp`;
        return `%(${ytKey})s`;
    });
}

// Windows: \ / : * ? " < > |   macOS: :   (/ is reserved as path separator in organized template)
const UNSAFE_CHARS_RE = /[\\:*?"<>|]/g;

/** Strip unsafe filesystem characters from a filename segment. */
function sanitizeSegment(s: string): string {
    return s.replace(UNSAFE_CHARS_RE, '').trim();
}

/**
 * Render a filename template with the given context.
 * Path separators `/` are preserved (for the `organized` pattern).
 * Each segment between `/` is sanitised individually.
 * The result is NOT truncated — callers may do so for long titles.
 */
export function renderFilenameTemplate(template: string, ctx: TemplateContext): string {
    const vars: Record<string, string> = {
        title: ctx.title,
        channel: ctx.channel,
        uploadDate: ctx.uploadDate,
        platform: ctx.platform,
        duration: ctx.duration,
        resolution: ctx.resolution,
        ext: ctx.ext,
        id: ctx.id
    };

    // Replace {{var}} tokens
    let rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        return key in vars ? (vars[key] ?? '') : `{{${key}}}`;
    });

    // Sanitise each path segment independently so "/" used as subfolder separator survives
    rendered = rendered
        .split('/')
        .map((seg) => sanitizeSegment(seg))
        .filter(Boolean)
        .join('/');

    return rendered;
}

export interface TemplateValidation {
    valid: boolean;
    error?: string;
    preview?: string;
}

/** Validate a template string and return a preview with sample data. */
export function validateFilenameTemplate(template: string): TemplateValidation {
    if (!template.trim()) {
        return { valid: false, error: 'Template cannot be empty' };
    }

    const KNOWN_VARS = new Set([
        'title',
        'channel',
        'uploadDate',
        'platform',
        'duration',
        'resolution',
        'ext',
        'id'
    ]);

    // Check for unknown {{vars}}
    const unknown: string[] = [];
    template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
        if (!KNOWN_VARS.has(key)) unknown.push(key);
        return '';
    });
    if (unknown.length > 0) {
        return {
            valid: false,
            error: `Unknown template variable(s): ${unknown.join(', ')}`
        };
    }

    const sampleCtx: TemplateContext = {
        title: 'Amazing Video Title',
        channel: 'My Channel',
        uploadDate: '20240315',
        platform: 'youtube',
        duration: '12:34',
        resolution: '1080p',
        ext: 'mp4',
        id: 'abc123'
    };

    const preview = renderFilenameTemplate(template, sampleCtx);
    if (!preview.trim()) {
        return { valid: false, error: 'Template produces an empty filename' };
    }

    return { valid: true, preview };
}

/**
 * Build a TemplateContext from yt-dlp flat/video info.
 * Accepts the loose shape coming from main process services.
 */
export function buildTemplateContext(params: {
    title?: string | null;
    channel?: string | null;
    uploadDate?: string | null; // YYYYMMDD
    extractor?: string | null;
    durationSeconds?: number | null;
    videoHeight?: number | null;
    ext?: string | null;
    id?: string | null;
}): TemplateContext {
    const dur = params.durationSeconds;
    let duration = '';
    if (dur && dur > 0) {
        const h = Math.floor(dur / 3600);
        const m = Math.floor((dur % 3600) / 60);
        const s = Math.floor(dur % 60);
        duration =
            h > 0
                ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                : `${m}:${String(s).padStart(2, '0')}`;
    }

    return {
        title: params.title?.trim() || 'Unknown',
        channel: params.channel?.trim() || 'Unknown',
        uploadDate: params.uploadDate?.replace(/\D/g, '').slice(0, 8) || '',
        platform: params.extractor?.toLowerCase().split(':')[0] || 'unknown',
        duration,
        resolution: params.videoHeight ? `${params.videoHeight}p` : '',
        ext: params.ext?.replace(/^\./, '') || 'mp4',
        id: params.id?.trim() || ''
    };
}
