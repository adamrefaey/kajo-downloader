declare module 'jest-axe' {
    import type { AxeResults } from 'axe-core';

    export function axe(
        element?: Element | null,
        options?: Record<string, unknown>
    ): Promise<AxeResults>;
}
