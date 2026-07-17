/**
 * Pin Electron path overrides before any other main-process work.
 *
 * Must be the first import from `electron/main.ts` (static side-effect import —
 * not a dynamic `import()`, which can race `app` ready under ESM).
 *
 * Layout under the userData root:
 * - stores / bin-runtime / salt → userData
 * - Chromium session (cookies, HTTP cache) → userData/session
 * - Electron logs → userData/logs (`setAppLogsPath` creates the dir)
 *
 * Override root with absolute `KAJO_USER_DATA` (tests / portable).
 *
 * @see https://www.electronjs.org/docs/latest/api/app#appsetpathname-path
 * @see https://www.electronjs.org/docs/latest/api/app#appsetapplogspathpath
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { kajoUserDataDirName } from './appIdentity';

function resolveUserDataRoot(): string {
    const fromEnv = process.env.KAJO_USER_DATA?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    return join(app.getPath('appData'), kajoUserDataDirName(app.isPackaged));
}

const userData = resolveUserDataRoot();
const sessionData = join(userData, 'session');

// setPath requires existing dirs; recursive mkdir creates userData + session.
mkdirSync(sessionData, { recursive: true });
app.setPath('userData', userData);
app.setPath('sessionData', sessionData);
app.setAppLogsPath(join(userData, 'logs'));
