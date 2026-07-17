/** Type declarations for the plain-JS binary-pins helper so strict `.ts` tests can import it. */

export declare const FFMPEG_BTBN_TARGET_IDS: readonly string[];

export declare const FFMPEG_BTBN_ASSET_ARCH: Readonly<Record<string, string>>;

export function validateBinaryPins(pins: unknown): void;

export function assertBtbnAssetMatchesPolicy(
    assetName: string,
    targetId: string,
    releaseLine: string
): void;

export function compareCalver(a: string, b: string): number;

export function isMonthEndAutobuildTag(tag: string): boolean;

export function pickBtbnReleaseLineAssetName(
    assets: Array<{ name: string }>,
    targetId: string,
    releaseLine: string
): string | null;
