/**
 * Ambient `window` typings for the renderer. The API shape is the single shared
 * `RendererApi` contract (src/shared/rendererApi.ts) — also the return type of
 * `createRendererApi` in the preload — so the renderer and preload can never drift.
 */
import type { RendererApi } from '../shared/rendererApi';

declare global {
    interface Window {
        api: RendererApi;
    }
}
