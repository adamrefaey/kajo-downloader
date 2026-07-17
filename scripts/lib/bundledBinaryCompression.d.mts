/** Type declarations for the plain-JS build helper so strict `.ts` tests can import it. */

export const COMPRESSED_BUNDLED_BINARY_BASE_NAMES: string[];

export function bundledExecutableFileName(baseName: string, platform: string): string;

export function compressionTargets(
    outputDir: string,
    platform: string
): { source: string; archive: string }[];

export function compressBundledBinaries(options: {
    outputDir: string;
    platform: string;
}): Promise<void>;
