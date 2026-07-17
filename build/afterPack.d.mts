/** Type declarations for the plain-JS electron-builder afterPack hook (for strict `.ts` tests). */

export function isCompressedBundledTool(binaryName: string): boolean;

declare function afterPack(context: unknown): Promise<void>;
export default afterPack;
