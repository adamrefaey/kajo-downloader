export type ToolbarIconName =
    | 'signIn'
    | 'signOut'
    | 'install'
    | 'folder'
    | 'download'
    | 'playlist'
    | 'loading';

export function ToolbarIcon({ name }: { name: ToolbarIconName }): React.JSX.Element {
    switch (name) {
        case 'signIn':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6v-2h5V6h-5V4Zm-1.2 3.2L16.6 12l-4.8 4.8-1.4-1.4 2.4-2.4H4v-2h8.8l-2.4-2.4 1.4-1.4Z"
                        fill="currentColor"
                    />
                </svg>
            );
        case 'signOut':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6v-2h5V6h-5V4ZM7.4 7.2l1.4 1.4L6.4 11H16v2H6.4l2.4 2.4-1.4 1.4L2.6 12l4.8-4.8Z"
                        fill="currentColor"
                    />
                </svg>
            );
        case 'install':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d="M11 4h2v8h3l-4 5-4-5h3V4Zm-6 14h14v2H5v-2Z" fill="currentColor" />
                </svg>
            );
        case 'folder':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V6Zm0 4h18l-1.2 8.2A2 2 0 0 1 17.8 20H6.2a2 2 0 0 1-2-1.8L3 10Z"
                        fill="currentColor"
                    />
                </svg>
            );
        case 'download':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d="M11 4h2v9h3l-4 5-4-5h3V4Zm-6 14h14v2H5v-2Z" fill="currentColor" />
                </svg>
            );
        case 'playlist':
            return (
                <svg
                    className="action-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M4 6h12v2H4V6Zm0 5h12v2H4v-2Zm0 5h8v2H4v-2Zm14-5 4 3-4 3v-6Z"
                        fill="currentColor"
                    />
                </svg>
            );
        case 'loading':
            return (
                <svg
                    className="action-icon action-icon-spin"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d="M12 4a8 8 0 1 1-7.4 11h2.2A6 6 0 1 0 12 6V4Z" fill="currentColor" />
                </svg>
            );
        default:
            return <span aria-hidden="true">?</span>;
    }
}
