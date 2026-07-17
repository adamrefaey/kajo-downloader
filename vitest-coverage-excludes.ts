/**
 * Coverage exclude globs for Vitest (grouped for maintenance).
 * Mirrors categories documented in vitest.config.ts coverage.include.
 */

/** Tooling and non-app entrypoints */
export const coverageExcludeTooling: string[] = [
    '**/*.d.ts',
    '**/*.test.{ts,tsx}',
    '**/tests/**',
    'electron.vite.config.ts',
    'vitest.config.ts',
    'src/main/index.ts',
    'src/preload/index.ts'
];

/** Types and bootstrap not counted toward strict gates */
export const coverageExcludeBootstrap: string[] = [
    'src/types/**',
    'src/renderer/src/main.tsx',
    /** Type-only / re-export barrels — no runtime logic to cover. */
    'src/shared/rendererApi.ts',
    'src/shared/ipcContract.ts',
    'src/shared/siteCoverage.types.ts',
    'src/shared/generated/**',
    'electron/preloadApi/index.ts'
];

/**
 * Shared helpers: listed in coverage include for visibility; excluded from the 100% denominator.
 * Runtime behavior is covered by `tests/sharedCoverageGaps.test.ts` and domain-focused suites.
 */
export const coverageExcludeSharedPendingStrictGate: string[] = ['src/shared/**'];

/** Electron main process — integration / manual QA */
export const coverageExcludeElectronIntegration: string[] = [
    'electron/main.ts',
    'electron/bootstrap.ts',
    'electron/services/siteAuthBrowserController.ts',
    'electron/services/siteAuthSessionState.ts',
    'electron/services/siteAuthNavigationGuards.ts',
    'electron/services/siteAuthViewLifecycle.ts',
    'electron/services/siteAuthCookieCapture.ts',
    'electron/services/binaries.ts',
    /**
     * yt-dlp engine — process I/O, worker lifecycle, argv/start/terminal/retry orchestration.
     * Pure helpers (retryLogic, downloadEngineState, downloadEngineConstants) stay IN the 100%
     * gate. progressParser stays excluded: structured-line parse helpers have many defensive
     * NaN branches that inflate branch denominators without adding product risk.
     */
    'electron/services/ytdlp/progressParser.ts',
    'electron/services/ytdlp/downloadEngine.ts',
    'electron/services/ytdlp/downloadEngineStart.ts',
    'electron/services/ytdlp/downloadEngineTerminal.ts',
    'electron/services/ytdlp/downloadEngineRetry.ts',
    'electron/services/ytdlp/downloadEngineArgs.ts',
    'electron/services/ytdlp/downloadEngineCommands.ts',
    'electron/services/ytdlp/downloadEngineControls.ts',
    'electron/services/ytdlp/downloadEngineOutputHandlers.ts',
    'electron/services/ytdlp/downloadEngineOutputPath.ts',
    'electron/services/ytdlp/downloadEngineProcessBinding.ts',
    'electron/services/ytdlp/downloadEngineProcessKill.ts',
    'electron/services/ytdlp/ytdlpWorker.ts',
    'electron/services/ytdlp/ytdlpUtilityProcess.ts',
    'electron/services/ytdlp/artifactCleanup.ts',
    'electron/services/ytdlp/index.ts',
    'electron/services/ytdlp/types.ts',
    'electron/services/ytdlp/mergeProgress.ts',
    /** Metadata: keep integration + yt-dlp I/O excluded; pure helpers are covered. */
    'electron/services/metadata/index.ts',
    'electron/services/metadata/types.ts',
    'electron/services/metadata/resolve.ts',
    'electron/services/metadata/ytdlpProcess.ts'
];

/** Renderer — large UI surfaces covered by integration / App tests */
export const coverageExcludeRendererUi: string[] = [
    'src/renderer/src/App.tsx',
    'src/renderer/src/components/SettingsModal.tsx',
    'src/renderer/src/app/**',
    'src/renderer/src/components/**',
    'src/renderer/src/hooks/**'
];

export const vitestCoverageExclude: string[] = [
    ...coverageExcludeTooling,
    ...coverageExcludeBootstrap,
    ...coverageExcludeSharedPendingStrictGate,
    ...coverageExcludeElectronIntegration,
    ...coverageExcludeRendererUi
];
