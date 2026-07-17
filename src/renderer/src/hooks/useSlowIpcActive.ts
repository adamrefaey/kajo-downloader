import { useEffect, useState } from 'react';

/**
 * Returns `true` while one or more IPC calls have exceeded the slow-IPC threshold
 * (5 s by default). The preload layer dispatches `kajo:slow-ipc` / `kajo:slow-ipc-done`
 * window events to drive this hook.
 */
export function useSlowIpcActive(): boolean {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const onSlow = (): void => setCount((n) => n + 1);
        const onDone = (): void => setCount((n) => Math.max(0, n - 1));
        window.addEventListener('kajo:slow-ipc', onSlow);
        window.addEventListener('kajo:slow-ipc-done', onDone);
        return () => {
            window.removeEventListener('kajo:slow-ipc', onSlow);
            window.removeEventListener('kajo:slow-ipc-done', onDone);
        };
    }, []);

    return count > 0;
}
