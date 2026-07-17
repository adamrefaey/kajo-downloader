/**
 * Split pasted workflow input into non-empty trimmed lines (one URL per line).
 */
export function parseBatchUrlLines(raw: string): string[] {
    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

/** True when the user has pasted more than one URL line (batch mode). */
export function isMultilineBatchInput(lines: string[]): boolean {
    return lines.length > 1;
}

/** First URL line for multiline batch input; otherwise the trimmed single value. */
export function primaryBatchOrSingleUrl(rawInput: string): string {
    const lines = parseBatchUrlLines(rawInput);
    if (isMultilineBatchInput(lines)) {
        return lines[0] ?? '';
    }
    return rawInput.trim();
}
