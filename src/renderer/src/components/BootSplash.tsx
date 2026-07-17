import appIconUrl from '@resources/icon.png?url';
import { useTranslation } from 'react-i18next';
import styles from './BootSplash.module.css';

export default function BootSplash(): React.JSX.Element {
    const { t } = useTranslation('app');
    return (
        <div className={styles.root}>
            <img
                src={appIconUrl}
                alt=""
                width={52}
                height={52}
                className={styles.logo}
                draggable={false}
            />
            <div className={styles.spinner} role="presentation" />
            <p className={styles.label}>{t('bootWelcome')}</p>
        </div>
    );
}
