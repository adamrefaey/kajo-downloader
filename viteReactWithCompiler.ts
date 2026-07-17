import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';

/**
 * Shared React + React Compiler setup for the renderer build and Vitest.
 *
 * `@vitejs/plugin-react` v6 replaced its Babel pipeline with Oxc, so the React
 * Compiler (a Babel plugin) is now wired through `@rolldown/plugin-babel` using
 * the plugin's `reactCompilerPreset` helper (Vite 8 is Rolldown-based).
 *
 * The preset filter is narrowed to renderer UI source only: Vitest pulls
 * `src/shared` / `src/store` / `electron` into the same transform pass, and
 * running the compiler there is both unnecessary (non-UI code) and risky
 * (`compilationMode: 'all'` is known to break patterns like `Array.from` in
 * module-level constants). `compilationMode: 'infer'` compiles only inferred
 * components/hooks; `target` defaults to React 19 (`react/compiler-runtime`).
 */
export async function reactWithCompiler(): Promise<PluginOption[]> {
    const compilerPreset = reactCompilerPreset({ compilationMode: 'infer' });
    compilerPreset.rolldown.filter ??= {};
    // Scope the compiler to renderer UI source (matters under Vitest, which funnels
    // src/shared, src/store and electron through one transform pass). A string glob keeps
    // the preset plain-object-cloneable.
    compilerPreset.rolldown.filter.id = {
        include: ['**/src/renderer/src/**/*.{js,jsx,ts,tsx}']
    };
    // `@rolldown/plugin-babel` resolves asynchronously — await it so we return a plain plugin,
    // not a Promise. electron-vite deep-clones the renderer config *before* awaiting plugins
    // and throws on a Promise ("Cannot deep clone non-plain object"); Vitest tolerates it.
    const compilerBabel = await babel({ presets: [compilerPreset] });
    return [react(), compilerBabel];
}
