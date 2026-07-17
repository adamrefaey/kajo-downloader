#!/usr/bin/env node
/**
 * check-env-docs.mjs
 *
 * Checks that every environment variable declared in .env.example is documented
 * in docs/env_reference.md.
 *
 * A variable is considered "declared" when a line contains `VAR_NAME=` (with or
 * without a leading `#` for optional vars).  A variable is "documented" when its
 * name appears wrapped in backticks in env_reference.md (`VAR_NAME`).
 *
 * Exits with code 1 if any variable is undocumented so it can gate CI.
 *
 * Usage: node scripts/check-env-docs.mjs
 */
import { readFileSync } from 'node:fs';

const files = {
    '.env.example': readFileSync('.env.example', 'utf8')
};
const docs = readFileSync('docs/env_reference.md', 'utf8');

/**
 * Extract all variable names from a .env.example file.
 * Matches lines like:  VAR_NAME=value  or  # VAR_NAME=value
 * Skips inline comments that are not assignments.
 */
function extractVars(content) {
    const names = new Set();
    for (const match of content.matchAll(/^#?\s*([A-Z][A-Z0-9_]{2,})=/gm)) {
        names.add(match[1]);
    }
    return names;
}

const missing = [];

for (const [file, content] of Object.entries(files)) {
    for (const varName of extractVars(content)) {
        if (!docs.includes(`\`${varName}\``)) {
            missing.push({ file, varName });
        }
    }
}

if (missing.length > 0) {
    console.error(
        'ERROR: Env vars declared in .env.example but missing from docs/env_reference.md:'
    );
    for (const { file, varName } of missing) {
        console.error(`  ${varName}  (declared in ${file})`);
    }
    console.error('\nAdd documentation for the variable(s) above to docs/env_reference.md.');
    process.exit(1);
}

const total = Object.values(files).reduce((n, c) => n + extractVars(c).size, 0);
console.log(`env_reference.md sync OK — ${total} variable(s) verified`);
