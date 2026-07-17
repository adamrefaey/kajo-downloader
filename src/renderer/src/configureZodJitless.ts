/**
 * Zod v4 probes `new Function("")` on first use to decide whether JIT schema
 * compilation is available. Strict CSP (no `unsafe-eval`) reports that probe as
 * a securitypolicyviolation in DevTools even when the throw is caught.
 *
 * Configure jitless mode before any schema parse so Zod skips the probe and uses
 * the interpreted validation path instead.
 *
 * @see https://github.com/colinhacks/zod/issues/4461
 */
import { z } from 'zod';

z.config({ jitless: true });
