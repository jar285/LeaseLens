// Sprint B.9 (#9) — deployment-mode policy (Robert C. Martin / Clean
// Architecture: keep policy — "when are guardrails enforced, when are demo
// affordances shown" — in one seam, separate from the route handlers and the
// env schema that consume it).
//
// These read the validated `env` singleton, so they are NODE-ONLY. The Edge
// runtime (middleware) cannot import env.ts (it throws at module load), so the
// per-visitor middleware change (#1) uses a separate process.env-raw predicate
// — do NOT add an env-importing function that middleware would transitively
// pull in here.

import { env } from '@/lib/env';

/** Public anonymous (CloudConvert-style) production mode. */
export function isPublicAnonMode(): boolean {
  return env.LEASELENS_PUBLIC_ANON_MODE;
}

/**
 * Demo UI affordances — the role switcher, the cockpit, and other
 * portfolio-only surfaces. This is the ONLY thing DEMO_MODE controls after #9;
 * it no longer solely gates the cost/rate guardrails.
 */
export function demoAffordancesEnabled(): boolean {
  return env.LEASELENS_DEMO_MODE;
}

/**
 * Whether the cost/rate guardrails (rate limit, spend ceiling, and later the
 * quota + budget ledger) are enforced. They run whenever the app is EXPOSED to
 * untrusted traffic — i.e. either the public-anon production deploy OR the
 * portfolio demo (which still needs budget protection). Only a plain
 * neither-flag deploy (local dev) runs unguarded.
 *
 * Sprint B.9 (#9) fixes the inversion bug where these were gated SOLELY on
 * DEMO_MODE, so a real production deploy (demo off) had no guardrails at all.
 */
export function guardrailsEnforced(): boolean {
  return isPublicAnonMode() || demoAffordancesEnabled();
}
