import { beforeEach, describe, expect, it } from 'vitest';

import {
    initMainI18n,
    translateMainError,
    translateMenu,
    translateUpdate
} from '../electron/i18n/mainI18n';

describe('mainI18n', () => {
    beforeEach(async () => {
        await initMainI18n('en');
    });

    it('translateMenu reads the menu namespace', () => {
        expect(translateMenu('file')).toBe('File');
    });

    it('translateUpdate reads the update namespace and supports interpolation', () => {
        expect(translateUpdate('latestMessage')).toBe('You are running the latest version.');
        expect(translateUpdate('availablePrefix', { version: '9.9.9' })).toContain('9.9.9');
    });

    it('translateMainError reads the errors namespace and supports interpolation', () => {
        expect(translateMainError('invalidRendererRequest')).toBe('Invalid renderer request.');
        expect(translateMainError('brewInstallFailed', { code: 42 })).toContain('42');
    });

    it('initMainI18n switches language when i18next is already initialized', async () => {
        await initMainI18n('de');
        expect(translateMenu('file')).toBe('Datei');
        await initMainI18n('en');
        expect(translateMenu('file')).toBe('File');
    });

    it('normalizes unknown locale tags to English', async () => {
        await initMainI18n('xx-YY');
        expect(translateMenu('file')).toBe('File');
    });
});
