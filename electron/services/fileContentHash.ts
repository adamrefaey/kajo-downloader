import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

/**
 * Streaming SHA-256 of a file (hex). Returns null if the path is missing or not a readable file.
 */
export async function sha256FileHex(filePath: string): Promise<string | null> {
    const p = filePath.trim();
    if (!p) {
        return null;
    }
    try {
        const st = await stat(p);
        if (!st.isFile()) {
            return null;
        }
    } catch {
        return null;
    }

    const { promise, resolve, reject } = Promise.withResolvers<string>();
    const hash = createHash('sha256');
    const stream = createReadStream(p);
    stream.on('error', reject);
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    return promise;
}
