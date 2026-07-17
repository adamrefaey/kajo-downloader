import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './StatusBanner.module.css';

type StatusTone = 'info' | 'success' | 'warning' | 'danger';

interface StatusBannerProps {
    tone?: StatusTone;
    title: string;
    message: string;
    children?: ReactNode;
}

function StatusBanner({
    tone = 'info',
    title,
    message,
    children
}: StatusBannerProps): React.JSX.Element {
    const isUrgent = tone === 'warning' || tone === 'danger';

    return (
        <div
            className={clsx(styles.root, styles[tone])}
            role={isUrgent ? 'alert' : 'status'}
            aria-live={isUrgent ? 'assertive' : 'polite'}
        >
            <div className={styles.head}>
                <strong>{title}</strong>
            </div>
            <p>{message}</p>
            {children}
        </div>
    );
}

export default StatusBanner;
