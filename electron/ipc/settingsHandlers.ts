import { spawn } from 'node:child_process';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_INVOKE, IPC_MAIN_TO_RENDERER } from '../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, type IpcFailureEnvelope, ipcFail } from '../../src/shared/ipcErrors';
import {
    setProxyProfileUrlPayloadSchema,
    setSettingsPayloadSchema
} from '../../src/shared/ipcPayloadSchemas';
import type { AppSettings, SetupStatus } from '../../src/types';
import { initMainI18n, translateMainError } from '../i18n/mainI18n';
import { trackMainChildProcess } from '../lib/childProcessRegistry';
import { safeSend } from '../mainHelpers';
import { DEFAULT_PROXY_PROFILE_ID, setProxyProfileUrl } from '../services/proxyProfileStore';
import { tryConsumeIpcRateLimitSlot } from './rateLimiter';
import type { IpcHandlerDeps } from './types';
import { parseIpcPayload, withValidSender } from './validateIpcPayload';

export function registerSettingsHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.settingsSelectOutputFolder,
        withValidSender(deps, async (event): Promise<string | IpcFailureEnvelope | null> => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.settingsSelectOutputFolder)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            const mainWindow = deps.getMainWindow();
            const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
            const result = ownerWindow
                ? await dialog.showOpenDialog(ownerWindow, {
                      properties: ['openDirectory', 'createDirectory']
                  })
                : await dialog.showOpenDialog({
                      properties: ['openDirectory', 'createDirectory']
                  });

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }

            return result.filePaths[0] ?? null;
        })
    );

    ipcMain.handle(
        IPC_INVOKE.settingsGet,
        withValidSender(deps, async (_event): Promise<AppSettings | IpcFailureEnvelope> => {
            return deps.getSettings();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.settingsGetSystemLocale,
        withValidSender(deps, (_event): string | IpcFailureEnvelope => {
            return app.getLocale();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.settingsSet,
        withValidSender(
            deps,
            async (_event, rawPatch: unknown): Promise<AppSettings | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.settingsSet)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const patch = parseIpcPayload(setSettingsPayloadSchema, rawPatch);
                if (!patch) {
                    return ipcFail(
                        IPC_ERROR_CODES.invalidPayload,
                        translateMainError('invalidRendererRequest')
                    );
                }

                const next = deps.applySettingsPatch(patch);
                if (patch.uiLocale !== undefined) {
                    await initMainI18n(deps.getEffectiveMainLocaleTag());
                    deps.rebuildApplicationMenu();
                }
                return next;
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.settingsProxySetProfileUrl,
        withValidSender(
            deps,
            async (
                _event,
                raw: unknown
            ): Promise<{ ok: true } | { ok: false; error: string } | IpcFailureEnvelope> => {
                if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.settingsProxySetProfileUrl)) {
                    return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
                }
                const payload = parseIpcPayload(setProxyProfileUrlPayloadSchema, raw);
                if (!payload) {
                    return { ok: false, error: 'Invalid payload' };
                }
                const profileId =
                    typeof payload.profileId === 'string' && payload.profileId.trim()
                        ? payload.profileId.trim().slice(0, 64)
                        : DEFAULT_PROXY_PROFILE_ID;
                const url =
                    payload.url === null || payload.url === undefined ? null : String(payload.url);
                return setProxyProfileUrl(profileId, url);
            }
        )
    );

    ipcMain.handle(
        IPC_INVOKE.setupCheck,
        withValidSender(deps, async (_event): Promise<SetupStatus | IpcFailureEnvelope> => {
            return deps.checkSetupStatus();
        })
    );

    ipcMain.handle(
        IPC_INVOKE.setupInstallYtdlp,
        withValidSender(deps, async (event): Promise<SetupStatus | IpcFailureEnvelope> => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.setupInstallYtdlp)) {
                return ipcFail(IPC_ERROR_CODES.rateLimited, 'Too many requests');
            }
            const hasBrew = await deps.commandExists('brew');
            if (!hasBrew) {
                throw new Error(translateMainError('homebrewMissing'));
            }

            const status = await deps.checkSetupStatus();
            if (status.ytdlpReady) {
                return status;
            }

            const packagesToInstall = [
                ...(!status.ytdlpInstalled ? ['yt-dlp'] : []),
                ...(!status.ffmpegInstalled ? ['ffmpeg'] : [])
            ];
            if (packagesToInstall.length === 0) {
                return deps.checkSetupStatus();
            }

            const setupLogCh = IPC_MAIN_TO_RENDERER.setupLog;
            const setupCompleteCh = IPC_MAIN_TO_RENDERER.setupComplete;

            const {
                promise: brewPromise,
                resolve: brewResolve,
                reject: brewReject
            } = Promise.withResolvers<void>();
            const child = trackMainChildProcess(
                spawn('brew', ['install', ...packagesToInstall], { stdio: 'pipe' })
            );

            const relay = (chunk: Buffer): void => {
                const line = chunk.toString();
                safeSend(event.sender, setupLogCh, { line });
            };

            child.stdout.on('data', relay);
            child.stderr.on('data', relay);
            child.on('error', brewReject);
            child.on('close', (code) => {
                if (code === 0) {
                    brewResolve();
                    return;
                }
                brewReject(
                    new Error(
                        translateMainError('brewInstallFailed', {
                            code: code ?? 'unknown'
                        })
                    )
                );
            });
            await brewPromise;

            const finalStatus = await deps.checkSetupStatus();
            safeSend(event.sender, setupCompleteCh);
            return finalStatus;
        })
    );
}
