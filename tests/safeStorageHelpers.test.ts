import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron.safeStorage
const mockEncryptString = vi.fn();
const mockDecryptString = vi.fn();
const mockIsEncryptionAvailable = vi.fn();

vi.mock('electron', () => ({
    safeStorage: {
        encryptString: (...args: unknown[]) => mockEncryptString(...args),
        decryptString: (...args: unknown[]) => mockDecryptString(...args),
        isEncryptionAvailable: () => mockIsEncryptionAvailable()
    }
}));

import {
    computeIntegrityTag,
    decryptField,
    encryptField,
    isLikelyEncrypted,
    verifyIntegrityTag
} from '../electron/lib/safeStorageHelpers';

describe('safeStorageHelpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('encryptField returns base64 when encryption available', () => {
        mockIsEncryptionAvailable.mockReturnValue(true);
        mockEncryptString.mockReturnValue(Buffer.from('encrypted'));
        const result = encryptField('secret');
        expect(mockEncryptString).toHaveBeenCalledWith('secret');
        expect(result).toBe(Buffer.from('encrypted').toString('base64'));
    });

    it('encryptField uses machine fallback when OS keychain encryption unavailable', () => {
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const enc = encryptField('secret');
        encryptField('second');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
        expect(enc.startsWith('fbk:')).toBe(true);
        expect(isLikelyEncrypted(enc)).toBe(true);
        expect(decryptField(enc)).toBe('secret');
    });

    it('decryptField decrypts base64 when encryption available', () => {
        mockIsEncryptionAvailable.mockReturnValue(true);
        mockDecryptString.mockReturnValue('secret');
        const encoded = Buffer.from('encrypted').toString('base64');
        expect(decryptField(encoded)).toBe('secret');
    });

    it('decryptField returns value as-is when encryption unavailable', () => {
        mockIsEncryptionAvailable.mockReturnValue(false);
        expect(decryptField('plaintext')).toBe('plaintext');
    });

    it('decryptField returns fbk payload as-is when fallback blob is too short', () => {
        mockIsEncryptionAvailable.mockReturnValue(false);
        const short = `fbk:${Buffer.alloc(8).toString('base64')}`;
        expect(decryptField(short)).toBe(short);
    });

    it('decryptField returns fbk payload as-is when fallback ciphertext is invalid', () => {
        mockIsEncryptionAvailable.mockReturnValue(false);
        const longEnough = Buffer.alloc(12 + 16 + 4);
        const bad = `fbk:${longEnough.toString('base64')}`;
        expect(decryptField(bad)).toBe(bad);
    });

    it('decryptField returns value as-is when decryption fails (plaintext migration)', () => {
        mockIsEncryptionAvailable.mockReturnValue(true);
        mockDecryptString.mockImplementation(() => {
            throw new Error('not encrypted');
        });
        expect(decryptField('plaintext-key')).toBe('plaintext-key');
    });

    it('isLikelyEncrypted detects base64 patterns', () => {
        expect(isLikelyEncrypted(Buffer.from('some encrypted data').toString('base64'))).toBe(true);
        expect(isLikelyEncrypted('short')).toBe(false);
        expect(isLikelyEncrypted('')).toBe(false);
        expect(isLikelyEncrypted('plain-text-key-with-dashes')).toBe(false);
    });

    it('computeIntegrityTag returns a base64 string', () => {
        const tag = computeIntegrityTag('some data');
        expect(typeof tag).toBe('string');
        expect(tag.length).toBeGreaterThan(0);
        // Same data produces same tag
        expect(computeIntegrityTag('some data')).toBe(tag);
        // Different data produces different tag
        expect(computeIntegrityTag('other data')).not.toBe(tag);
    });

    it('verifyIntegrityTag returns true for matching tag', () => {
        const data = '{"key":"value"}';
        const tag = computeIntegrityTag(data);
        expect(verifyIntegrityTag(data, tag)).toBe(true);
    });

    it('verifyIntegrityTag returns false for tampered data', () => {
        const tag = computeIntegrityTag('original');
        expect(verifyIntegrityTag('tampered', tag)).toBe(false);
    });

    it('verifyIntegrityTag returns false for wrong-length tag', () => {
        expect(verifyIntegrityTag('data', 'short')).toBe(false);
    });
});

describe('loadOrCreateSalt — salt generation', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reuses an existing valid salt file when present', async () => {
        const validSalt = Buffer.alloc(32, 0xab);
        vi.doMock('node:fs', () => ({
            existsSync: () => true,
            readFileSync: () => validSalt.toString('hex'),
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn()
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { encryptField: freshEncrypt, decryptField: freshDecrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        const enc = freshEncrypt('valid-salt');
        expect(enc.startsWith('fbk:')).toBe(true);
        expect(freshDecrypt(enc)).toBe('valid-salt');
        warn.mockRestore();
    });

    it('generates and writes a fresh salt when the salt file does not exist', async () => {
        const mockWriteFileSync = vi.fn();
        vi.doMock('node:fs', () => ({
            existsSync: () => false,
            mkdirSync: vi.fn(),
            writeFileSync: mockWriteFileSync,
            readFileSync: vi.fn()
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { encryptField: freshEncrypt, decryptField: freshDecrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        const enc = freshEncrypt('round-trip');
        expect(enc.startsWith('fbk:')).toBe(true);
        expect(freshDecrypt(enc)).toBe('round-trip');
        expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('still returns a usable ephemeral salt when the salt file write fails', async () => {
        vi.doMock('node:fs', () => ({
            existsSync: () => false,
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn().mockImplementation(() => {
                throw new Error('disk full');
            }),
            readFileSync: vi.fn()
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { encryptField: freshEncrypt } = await import('../electron/lib/safeStorageHelpers');
        expect(freshEncrypt('ephemeral').startsWith('fbk:')).toBe(true);
        warn.mockRestore();
    });

    it('regenerates salt when the existing salt file contains wrong-length data', async () => {
        const mockWriteFileSync = vi.fn();
        vi.doMock('node:fs', () => ({
            // File exists but its hex decodes to 16 bytes instead of the required 32
            existsSync: () => true,
            readFileSync: () => Buffer.alloc(16).toString('hex'),
            mkdirSync: vi.fn(),
            writeFileSync: mockWriteFileSync
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { encryptField: freshEncrypt } = await import('../electron/lib/safeStorageHelpers');
        const enc = freshEncrypt('regen-test');
        expect(enc.startsWith('fbk:')).toBe(true);
        expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('generates random salt and encrypts when readFileSync throws (file read error)', async () => {
        vi.doMock('node:fs', () => ({
            existsSync: () => true,
            readFileSync: vi.fn().mockImplementation(() => {
                throw new Error('EACCES: permission denied');
            }),
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn()
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { encryptField: freshEncrypt, decryptField: freshDecrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        const enc = freshEncrypt('read-error-test');
        expect(enc.startsWith('fbk:')).toBe(true);
        expect(freshDecrypt(enc)).toBe('read-error-test');
        warn.mockRestore();
    });

    it('uses ephemeral salt when writeFileSync throws during wrong-length salt regen', async () => {
        vi.doMock('node:fs', () => ({
            existsSync: () => true,
            readFileSync: () => Buffer.alloc(16).toString('hex'),
            mkdirSync: vi.fn().mockImplementation(() => {
                throw new Error('EROFS: read-only file system');
            }),
            writeFileSync: vi.fn()
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { encryptField: freshEncrypt } = await import('../electron/lib/safeStorageHelpers');
        expect(freshEncrypt('rofs-regen').startsWith('fbk:')).toBe(true);
        warn.mockRestore();
    });
});

describe('initSafeStorageAsync — async path', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('generates and writes a fresh salt when the async salt file does not exist', async () => {
        const mockWriteFile = vi.fn().mockResolvedValue(undefined);
        vi.doMock('node:fs', () => ({
            existsSync: () => false,
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn(),
            readFileSync: vi.fn()
        }));
        vi.doMock('node:fs/promises', () => ({
            readFile: vi.fn(),
            mkdir: vi.fn().mockResolvedValue(undefined),
            writeFile: mockWriteFile
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { initSafeStorageAsync, encryptField: freshEncrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        await initSafeStorageAsync();
        expect(freshEncrypt('async-init').startsWith('fbk:')).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('reads existing valid salt from disk via the async path', async () => {
        const validHex = Buffer.alloc(32).toString('hex');
        const mockReadFile = vi.fn().mockResolvedValue(validHex);
        vi.doMock('node:fs', () => ({
            existsSync: () => true,
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn(),
            readFileSync: vi.fn()
        }));
        vi.doMock('node:fs/promises', () => ({
            readFile: mockReadFile,
            mkdir: vi.fn().mockResolvedValue(undefined),
            writeFile: vi.fn().mockResolvedValue(undefined)
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { initSafeStorageAsync, encryptField: freshEncrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        await initSafeStorageAsync();
        expect(freshEncrypt('valid-salt').startsWith('fbk:')).toBe(true);
        expect(mockReadFile).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('regenerates salt when async readFile yields wrong-length hex', async () => {
        const shortHex = Buffer.alloc(16).toString('hex');
        const mockWriteFile = vi.fn().mockResolvedValue(undefined);
        vi.doMock('node:fs', () => ({
            existsSync: () => true,
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn(),
            readFileSync: vi.fn()
        }));
        vi.doMock('node:fs/promises', () => ({
            readFile: vi.fn().mockResolvedValue(shortHex),
            mkdir: vi.fn().mockResolvedValue(undefined),
            writeFile: mockWriteFile
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { initSafeStorageAsync, encryptField: freshEncrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        await initSafeStorageAsync();
        expect(freshEncrypt('short-async').startsWith('fbk:')).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('regenerates salt when async readFile throws', async () => {
        const mockWriteFile = vi.fn().mockResolvedValue(undefined);
        vi.doMock('node:fs', () => ({
            existsSync: () => true,
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn(),
            readFileSync: vi.fn()
        }));
        vi.doMock('node:fs/promises', () => ({
            readFile: vi.fn().mockRejectedValue(new Error('EACCES')),
            mkdir: vi.fn().mockResolvedValue(undefined),
            writeFile: mockWriteFile
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { initSafeStorageAsync, encryptField: freshEncrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        await initSafeStorageAsync();
        expect(freshEncrypt('read-throws').startsWith('fbk:')).toBe(true);
        warn.mockRestore();
    });

    it('uses ephemeral salt when async mkdir/writeFile throws', async () => {
        vi.doMock('node:fs', () => ({
            existsSync: () => false,
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn(),
            readFileSync: vi.fn()
        }));
        vi.doMock('node:fs/promises', () => ({
            readFile: vi.fn(),
            mkdir: vi.fn().mockRejectedValue(new Error('EROFS')),
            writeFile: vi.fn().mockRejectedValue(new Error('EROFS'))
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { initSafeStorageAsync, encryptField: freshEncrypt } = await import(
            '../electron/lib/safeStorageHelpers'
        );
        await initSafeStorageAsync();
        expect(freshEncrypt('ephemeral-async').startsWith('fbk:')).toBe(true);
        warn.mockRestore();
    });

    it('returns cached derived key on second initSafeStorageAsync call', async () => {
        const validHex = Buffer.alloc(32).toString('hex');
        const mockReadFile = vi.fn().mockResolvedValue(validHex);
        vi.doMock('node:fs', () => ({
            existsSync: () => true,
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn(),
            readFileSync: vi.fn()
        }));
        vi.doMock('node:fs/promises', () => ({
            readFile: mockReadFile,
            mkdir: vi.fn(),
            writeFile: vi.fn()
        }));
        mockIsEncryptionAvailable.mockReturnValue(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { initSafeStorageAsync } = await import('../electron/lib/safeStorageHelpers');
        await initSafeStorageAsync();
        await initSafeStorageAsync();
        expect(mockReadFile).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
