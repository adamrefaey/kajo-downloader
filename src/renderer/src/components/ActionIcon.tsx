export type ActionIconName = 'pause' | 'resume' | 'retry' | 'open' | 'reveal' | 'remove';

/** Inline SVG glyphs for download-row action buttons (pause/resume/open/remove). */
export function ActionIcon({ name }: { name: ActionIconName }): React.JSX.Element {
    switch (name) {
        case 'pause':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                    <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                </svg>
            );
        case 'resume':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d="M8 5.8 18 12 8 18.2V5.8Z" fill="currentColor" />
                </svg>
            );
        case 'retry':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M12 4a8 8 0 0 1 7.75 6h-2.26A6 6 0 1 0 18 12h2A8 8 0 1 1 12 4Z"
                        fill="currentColor"
                    />
                    <path
                        d="M19 5v4h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            );
        case 'open':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <circle
                        cx="12"
                        cy="12"
                        r="9.25"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.65"
                    />
                    <path d="M10.35 8.35v7.3L16.65 12l-6.3-3.65Z" fill="currentColor" />
                </svg>
            );
        case 'reveal':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-9Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.65"
                    />
                    <path d="M4 9.5h16" fill="none" stroke="currentColor" strokeWidth="1.65" />
                    <path
                        d="M9.5 13.25 11.75 15.5 15.25 11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.65"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            );
        case 'remove':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M7 7l10 10M17 7L7 17"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                    />
                </svg>
            );
        default:
            return <span aria-hidden="true">?</span>;
    }
}
