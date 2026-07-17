#!/usr/bin/env node
/**
 * i18n key hygiene gate (no external tool — this repo translates via aliased hooks
 * (`const { t: tApp } = useTranslation('app')`) and main-process wrappers
 * (`translateMenu`/`translateMainError`/`translateUpdate`), which off-the-shelf
 * extractors that only match literal `t('…')` cannot see.
 *
 * Rules enforced (exit 1 on violation):
 *  1. No DEAD keys — every key defined in the `en` source locale must appear (by its
 *     within-namespace dotted path, or de-pluralized base) as a substring of non-locale
 *     source. Function-name agnostic, so aliases/wrappers/prefixed access all count.
 *  2. No STALE keys — no locale may contain a key absent from `en`.
 *
 * Missing translations (a key in `en` not yet translated in another locale) are NOT failed:
 * i18next falls back to `en`, so they are acceptable until translated.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LOCALES = 'src/i18n/locales';
const SOURCE_LOCALE = 'en';

// Keys reached only via dynamic `t(`prefix.${x}`)` — their leaves never appear literally.
const DYNAMIC_PREFIXES = [
    'multiVideoPicker.channelTab',
    'multiVideoPicker.rowChannelSection',
    'signedSites.health'
];
const PLURAL = /_(zero|one|two|few|many|other)$/;

const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === 'object'
            ? flatten(v, prefix ? `${prefix}.${k}` : k)
            : [prefix ? `${prefix}.${k}` : k]
    );

// One in-memory corpus of all app source (excluding locale JSON) — substring search is
// robust to apostrophes/quotes that break regex-based literal extraction.
const sourceFiles = execSync('git ls-files src electron', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.includes(`${LOCALES}/`) && fs.existsSync(f));
const corpus = sourceFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const isUsed = (keyPath) => {
    if (DYNAMIC_PREFIXES.some((p) => keyPath.startsWith(`${p}.`))) return true;
    if (corpus.includes(keyPath)) return true;
    const base = keyPath.replace(PLURAL, '');
    return base !== keyPath && corpus.includes(base);
};

const enDir = path.join(LOCALES, SOURCE_LOCALE);
const enKeys = {};
for (const file of fs.readdirSync(enDir)) {
    enKeys[file] = new Set(flatten(JSON.parse(fs.readFileSync(path.join(enDir, file), 'utf8'))));
}

const dead = [];
for (const [file, keys] of Object.entries(enKeys)) {
    for (const k of keys) if (!isUsed(k)) dead.push(`${file.replace('.json', '')}:${k}`);
}

const stale = [];
for (const lang of fs.readdirSync(LOCALES)) {
    if (lang === SOURCE_LOCALE) continue;
    for (const [file, enSet] of Object.entries(enKeys)) {
        const f = path.join(LOCALES, lang, file);
        if (!fs.existsSync(f)) continue;
        for (const k of flatten(JSON.parse(fs.readFileSync(f, 'utf8'))))
            if (!enSet.has(k)) stale.push(`${lang}/${file} ${k}`);
    }
}

if (dead.length === 0 && stale.length === 0) {
    console.log(`i18n keys OK — every en key is referenced; no stale keys across locales.`);
    process.exit(0);
}
if (dead.length) {
    console.error(`\n✗ ${dead.length} DEAD i18n key(s) (defined in en, never referenced in code):`);
    for (const d of dead) console.error(`    ${d}`);
}
if (stale.length) {
    console.error(`\n✗ ${stale.length} STALE i18n key(s) (in a locale but not en):`);
    for (const s of stale) console.error(`    ${s}`);
}
process.exit(1);
