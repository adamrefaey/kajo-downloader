#!/usr/bin/env node

/**
 * Loads .env and .env.local (if they exist) into process.env before spawning
 * the given command — replaces dotenv-cli with the native Node 22+ API
 * `process.loadEnvFile()`.
 *
 * Usage: node scripts/with-env.mjs <command> [args...]
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

for (const file of ['.env', '.env.local']) {
    try {
        process.loadEnvFile(file);
    } catch {
        // File doesn't exist or isn't readable — silently skip.
    }
}

const [, , ...args] = process.argv;
if (args.length === 0) {
    process.stderr.write('[with-env] No command specified\n');
    process.exit(1);
}

// pnpm's `run <script> -- <args>` can forward a literal `--` separator; drop it.
const [cmd, ...rest] = args.filter((arg) => arg !== '--');

// Resolve cmd from node_modules/.bin when possible so shell:false works on
// Unix and we only fall back to cmd.exe on Windows (where .cmd wrappers
// require a shell process to execute).
const binDir = path.join(import.meta.dirname, '..', 'node_modules', '.bin');
const isWindows = process.platform === 'win32';
const candidateBin = path.join(binDir, isWindows ? `${cmd}.cmd` : cmd);
const resolvedBin = existsSync(candidateBin) ? candidateBin : cmd;

// On Windows the resolved .cmd script must be run via cmd.exe; on Unix exec directly.
const spawnCmd = isWindows ? (process.env.COMSPEC ?? 'cmd.exe') : resolvedBin;
// nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
// Rationale: cmd comes from process.argv which is set by package.json scripts —
// developer-controlled, never from external user input. shell:true is only used
// on Windows where cmd.exe is required to invoke .cmd wrappers.
const spawnArgs = isWindows ? ['/d', '/s', '/c', resolvedBin, ...rest] : rest;

const result = spawnSync(spawnCmd, spawnArgs, {
    stdio: 'inherit',
    env: process.env,
    shell: false
});

process.exit(result.status ?? (result.signal ? 1 : 0));
