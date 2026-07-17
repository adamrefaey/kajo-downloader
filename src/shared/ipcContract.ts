/**
 * The IPC contract surface shared by preload and main: channel names, the IPC error
 * envelope, and the Zod payload schemas. Each schema's `z.infer` IS the static payload type,
 * so validation and types are one source and cannot drift.
 *
 * The renderer method API is the separate `RendererApi` contract (./rendererApi.ts) — the return
 * type of `createRendererApi` (preload) and the type of `window.api` (renderer) — so those two
 * cannot drift either. The runtime `ipcPreloadParity` test asserts the preload references every
 * channel declared here.
 */
export { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from './ipcChannels';
export {
    IPC_ERROR_CODES,
    type IpcErrorCode,
    type IpcFailureEnvelope,
    type IpcResult,
    isIpcFailureEnvelope
} from './ipcErrors';
export {
    type CheckDownloadFilePathsPayload,
    type CleanupDownloadArtifactsPayload,
    type CleanupEmptyBatchDirsPayload,
    checkDownloadFilePathsPayloadSchema,
    cleanupDownloadArtifactsPayloadSchema,
    cleanupEmptyBatchDirsPayloadSchema,
    type DownloadErrorPayload,
    type DownloadHistoryListOpts,
    downloadErrorPayloadSchema,
    downloadHistoryListOptsSchema,
    httpMediaUrlSchema,
    nonEmptyTrimmedStringSchema,
    type PrepareChannelOutputDirPayload,
    type PrepareChannelOutputDirResult,
    type PreparePlaylistOutputDirPayload,
    parseSearchIpcPayload,
    prepareChannelOutputDirPayloadSchema,
    preparePlaylistOutputDirPayloadSchema,
    type SearchIpcPayload,
    type SetProxyProfileUrlPayload,
    type SetSettingsPayload,
    type SiteAuthOpenPayload,
    type StartDownloadPayload,
    searchIpcPayloadObjectSchema,
    setProxyProfileUrlPayloadSchema,
    setSettingsPayloadSchema,
    siteAuthOpenPayloadSchema,
    startDownloadPayloadSchema,
    urlArgSchema,
    YTSEARCH_MAX_N,
    ytDlpFormatIdSchema
} from './ipcPayloadSchemas';
