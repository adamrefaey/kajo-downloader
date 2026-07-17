import type { TFunction } from 'i18next';
import BootSplash from '../components/BootSplash';
import bootSplashStyles from '../components/BootSplash.module.css';
import { AppShell, AppShellWorkspace } from '../components/layout/AppShell';
import type { RendererPlatform } from './controller/rendererPlatform';

export function AppBootSplashLayout({
    platform,
    t
}: {
    platform: RendererPlatform;
    t: TFunction;
}): React.JSX.Element {
    return (
        <AppShell platformClassName={`platform-${platform}`} showFooter={false}>
            <AppShellWorkspace
                primary={
                    <section
                        id="workflow-region"
                        className={bootSplashStyles.host}
                        aria-labelledby="preparing-app-heading"
                        aria-busy="true"
                        aria-live="polite"
                    >
                        <h2 id="preparing-app-heading" className="sr-only">
                            {t('app:preparingHeading')}
                        </h2>
                        <BootSplash />
                    </section>
                }
            />
        </AppShell>
    );
}
