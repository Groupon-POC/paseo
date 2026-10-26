// Added for Groupon Desk (fork of Paseo, Apache-2.0): Zod never compiles a parser with `new Function`.

/**
 * Zod's schemas parse without just-in-time compilation (`jitless`), before any of them runs: the
 * work window's web build sends `script-src` without 'unsafe-eval', and Zod's JIT probe
 * (`new Function("")`) and compiled object parsers were the only string evals its Content
 * Security Policy reported (Sentry FRONTEND-DESK-TS-1, 52 reports from 4 people, 2026-10-21 to
 * 2026-10-26, MEASURED). Under an enforced policy Zod would fall back on its own, but every page
 * load would still report the blocked probe; with `jitless` nothing is attempted.
 *
 * Constraints:
 * - Imported by `index.ts` right after the early polyfills: Zod reads the setting once, on the
 *   first object it parses, so a schema parsed before this module would keep the JIT
 */

import { config } from "zod";

config({ jitless: true });
