import { describe, expect, it } from 'vitest';
import { SECURE_MAIN_WEB_PREFERENCES_BASE } from '../electron/mainWindowSecurity';

describe('SECURE_MAIN_WEB_PREFERENCES_BASE', () => {
    it('matches Electron security checklist for the primary window', () => {
        expect(SECURE_MAIN_WEB_PREFERENCES_BASE).toEqual({
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false
        });
    });
});
