import { describe, expect, it } from 'vitest';
import {
    isMultilineBatchInput,
    parseBatchUrlLines,
    primaryBatchOrSingleUrl
} from '../src/shared/batchUrlInput';

describe('parseBatchUrlLines', () => {
    it('splits on newlines and trims', () => {
        expect(parseBatchUrlLines(' https://a.com \n https://b.com ')).toEqual([
            'https://a.com',
            'https://b.com'
        ]);
    });

    it('handles CRLF and drops empty lines', () => {
        expect(parseBatchUrlLines('https://x.com\r\n\r\nhttps://y.com\n')).toEqual([
            'https://x.com',
            'https://y.com'
        ]);
    });

    it('returns empty array for whitespace only', () => {
        expect(parseBatchUrlLines('  \n\t\n  ')).toEqual([]);
    });
});

describe('isMultilineBatchInput', () => {
    it('is true only with two or more lines', () => {
        expect(isMultilineBatchInput(['https://a.com'])).toBe(false);
        expect(isMultilineBatchInput([])).toBe(false);
        expect(isMultilineBatchInput(['https://a.com', 'https://b.com'])).toBe(true);
    });
});

describe('primaryBatchOrSingleUrl', () => {
    it('returns the first line when there are multiple URL lines', () => {
        expect(primaryBatchOrSingleUrl('https://a.com/x\nhttps://b.com/y')).toBe('https://a.com/x');
    });

    it('returns trimmed input for a single line', () => {
        expect(primaryBatchOrSingleUrl('  https://one.com  ')).toBe('https://one.com');
    });
});
