/** Download-start outcome types (shared renderer + preload). */

export interface StartDownloadSuccess {
    downloadId: string;
    reservedOutputPath: string;
}

export interface StartDownloadPolicyBlocked {
    blocked: true;
    policy: 'prohibited_adult_content';
}

export type StartDownloadOutcome = StartDownloadSuccess | StartDownloadPolicyBlocked;
