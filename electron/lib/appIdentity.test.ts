import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    KAJO_APP_ID,
    KAJO_PRODUCT_DISPLAY_NAME,
    KAJO_USER_DATA_DIR,
    kajoUserDataDirName
} from './appIdentity';

const projectRoot = join(import.meta.dirname, '../..');

describe('appIdentity', () => {
    it('uses one filesystem slug and isolates unpackaged with -dev', () => {
        expect(KAJO_USER_DATA_DIR).toBe('kajo-downloader');
        expect(KAJO_PRODUCT_DISPLAY_NAME).toBe('Kajo Downloader');
        expect(KAJO_APP_ID).toBe('app.kajodownloader.desktop');
        expect(kajoUserDataDirName(true)).toBe(KAJO_USER_DATA_DIR);
        expect(kajoUserDataDirName(false)).toBe(`${KAJO_USER_DATA_DIR}-dev`);
    });

    it('stays aligned with package.json and electron-builder.config.mjs', async () => {
        const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
            name?: string;
            productName?: string;
        };
        const { default: builderConfig } = (await import(
            pathToFileURL(join(projectRoot, 'electron-builder.config.mjs')).href
        )) as {
            default: { appId?: string; productName?: string };
        };

        expect(pkg.name).toBe(KAJO_USER_DATA_DIR);
        expect(pkg.productName).toBe(KAJO_PRODUCT_DISPLAY_NAME);
        expect(builderConfig.productName).toBe(KAJO_PRODUCT_DISPLAY_NAME);
        expect(builderConfig.appId).toBe(KAJO_APP_ID);
    });
});
