import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    pbkdf2Sync,
    randomBytes,
    timingSafeEqual
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

const AES_ALGORITHM = 'aes-256-gcm';
const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;
const FALLBACK_PREFIX = 'fbk:';

/** PBKDF2 parameters — 100 k iterations provides ~40 ms on a modern CPU (acceptable for startup). */
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const SALT_FILE_NAME = 'fallback-key-salt';
const SALT_BYTES = 32;

let fallbackWarningEmitted = false;

function emitFallbackWarning(): void {
    if (!fallbackWarningEmitted) {
        fallbackWarningEmitted = true;
        console.warn(
            '[safe-storage] OS keychain encryption is unavailable — using PBKDF2-derived fallback encryption. ' +
                'Stored credentials are protected against casual access but not against targeted attacks on this machine.'
        );
    }
}

/** Loads (or generates) the persistent random salt used for PBKDF2 key derivation. */
async function loadOrCreateSalt(): Promise<Buffer> {
    let saltPath: string;
    try {
        saltPath = join(app.getPath('userData'), SALT_FILE_NAME);
    } catch {
        // app.getPath may throw before app is ready (tests). Fall back gracefully.
        saltPath = join(process.cwd(), SALT_FILE_NAME);
    }

    if (existsSync(saltPath)) {
        try {
            const hex = (await readFile(saltPath, 'utf8')).trim();
            const buf = Buffer.from(hex, 'hex');
            if (buf.length === SALT_BYTES) {
                return buf;
            }
        } catch {
            // Corrupt or unreadable — regenerate.
        }
    }

    const salt = randomBytes(SALT_BYTES);
    try {
        await mkdir(join(saltPath, '..'), { recursive: true });
        await writeFile(saltPath, salt.toString('hex'), { encoding: 'utf8', mode: 0o600 });
    } catch {
        // Cannot persist — use ephemeral salt; encryption still works within this session.
    }
    return salt;
}

/** Cached derived key — computed once per process instance. */
let derivedFallbackKey: Buffer | null = null;

/**
 * Derives a 256-bit key using PBKDF2(SHA-256) from a persistent random salt +
 * machine-stable identifiers. Far stronger than a plain SHA-256 hash because:
 *   - The random salt prevents pre-computation / rainbow tables.
 *   - 100 k iterations make brute-force attacks ~100 k× more expensive.
 */
async function deriveFallbackKeyAsync(): Promise<Buffer> {
    if (derivedFallbackKey) {
        return derivedFallbackKey;
    }
    const salt = await loadOrCreateSalt();
    const material = [hostname(), userInfo().username, 'kajo-downloader-v2'].join(':');
    derivedFallbackKey = pbkdf2Sync(
        material,
        salt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_DIGEST
    );
    return derivedFallbackKey;
}

/**
 * Pre-warms the PBKDF2 derived key asynchronously during startup so that subsequent
 * calls to `encryptField`/`decryptField` use the cached key without any synchronous I/O.
 *
 * Should be called once during `app.whenReady()` before any encryption is needed.
 */
export async function initSafeStorageAsync(): Promise<void> {
    await deriveFallbackKeyAsync();
}

function getDerivedFallbackKey(): Buffer {
    if (derivedFallbackKey) {
        return derivedFallbackKey;
    }
    // Fallback: derive synchronously using mkdirSync/writeFileSync as a last resort
    // (should not happen if initSafeStorageAsync was awaited at startup).
    const saltPath = (() => {
        try {
            return join(app.getPath('userData'), SALT_FILE_NAME);
        } catch {
            return join(process.cwd(), SALT_FILE_NAME);
        }
    })();
    let salt: Buffer;
    if (existsSync(saltPath)) {
        try {
            const hex = readFileSync(saltPath, 'utf8').trim();
            const buf = Buffer.from(hex, 'hex');
            if (buf.length === SALT_BYTES) {
                salt = buf;
            } else {
                salt = randomBytes(SALT_BYTES);
                try {
                    mkdirSync(join(saltPath, '..'), { recursive: true });
                    writeFileSync(saltPath, salt.toString('hex'), {
                        encoding: 'utf8',
                        mode: 0o600
                    });
                } catch {
                    /* ephemeral */
                }
            }
        } catch {
            salt = randomBytes(SALT_BYTES);
        }
    } else {
        salt = randomBytes(SALT_BYTES);
        try {
            mkdirSync(join(saltPath, '..'), { recursive: true });
            writeFileSync(saltPath, salt.toString('hex'), { encoding: 'utf8', mode: 0o600 });
        } catch {
            /* ephemeral */
        }
    }
    const material = [hostname(), userInfo().username, 'kajo-downloader-v2'].join(':');
    derivedFallbackKey = pbkdf2Sync(
        material,
        salt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_DIGEST
    );
    return derivedFallbackKey;
}

function fallbackEncrypt(value: string): string {
    const key = getDerivedFallbackKey();
    const iv = randomBytes(AES_IV_BYTES);
    const cipher = createCipheriv(AES_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, encrypted]);
    return FALLBACK_PREFIX + combined.toString('base64');
}

function fallbackDecrypt(prefixedEncoded: string): string | null {
    const raw = prefixedEncoded.slice(FALLBACK_PREFIX.length);
    try {
        const combined = Buffer.from(raw, 'base64');
        if (combined.length < AES_IV_BYTES + AES_TAG_BYTES + 1) {
            return null;
        }
        const iv = combined.subarray(0, AES_IV_BYTES);
        const tag = combined.subarray(AES_IV_BYTES, AES_IV_BYTES + AES_TAG_BYTES);
        const encrypted = combined.subarray(AES_IV_BYTES + AES_TAG_BYTES);
        const key = getDerivedFallbackKey();
        const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AES_TAG_BYTES });
        decipher.setAuthTag(tag);
        return decipher.update(encrypted) + decipher.final('utf8');
    } catch {
        return null;
    }
}

export function encryptField(value: string): string {
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(value).toString('base64');
    }
    emitFallbackWarning();
    return fallbackEncrypt(value);
}

export function decryptField(encoded: string): string {
    if (safeStorage.isEncryptionAvailable()) {
        try {
            return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
        } catch {
            // May be fallback-encrypted or plaintext from before encryption was enabled
        }
    }
    if (encoded.startsWith(FALLBACK_PREFIX)) {
        const result = fallbackDecrypt(encoded);
        if (result != null) {
            return result;
        }
    }
    // Legacy plaintext or unrecognized format — return as-is
    return encoded;
}

/** Check if a stored value looks like base64 encrypted data vs plaintext */
export function isLikelyEncrypted(value: string): boolean {
    if (value.startsWith(FALLBACK_PREFIX)) return true;
    if (!value || value.length < 20) return false;
    return /^[A-Za-z0-9+/]+=*$/.test(value);
}

/**
 * Computes an HMAC-SHA256 tag over `data` using a machine-derived key.
 * Used to detect tampering of critical electron-store fields that are not individually
 * encrypted (cookie vault blobs, proxy profile URLs) so an offline attacker cannot forge them.
 */
export function computeIntegrityTag(data: string): string {
    return createHmac('sha256', getDerivedFallbackKey()).update(data, 'utf8').digest('base64');
}

/**
 * Returns `true` only when `tag` exactly matches the HMAC of `data`.
 * Comparison is timing-safe to avoid timing side-channels.
 */
export function verifyIntegrityTag(data: string, tag: string): boolean {
    const expected = computeIntegrityTag(data);
    const a = Buffer.from(expected, 'base64');
    const b = Buffer.from(tag, 'base64');
    if (a.length !== b.length) {
        return false;
    }
    return timingSafeEqual(a, b);
}
