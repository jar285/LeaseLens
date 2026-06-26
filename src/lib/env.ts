import { z } from 'zod';

const envSchema = z.object({
  LEASELENS_DB_PATH: z.string().default('./data/leaselens.db'),
  LEASELENS_DEMO_MODE: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  LEASELENS_ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5'),
  LEASELENS_DAILY_SPEND_CEILING_USD: z.coerce.number().default(2),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  LEASELENS_SESSION_SECRET: z
    .string()
    .min(32, 'LEASELENS_SESSION_SECRET must be at least 32 characters'),
  LEASELENS_LEASE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(102400)
    .max(5242880)
    .default(1048576),
  LEASELENS_LEASE_MAX_PAGES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30),
  // Sprint 26c.10 — gate the auto-scan-on-upload behavior. When true
  // (the default), AutoScanRunner fires the standard scan automatically
  // after a fresh Mode A upload so the user sees red-flag cards stream
  // in without having to open the FAB and ask for it. Setting this to
  // 'false' falls back to the manual flow (user must open the FAB and
  // run the scan themselves) — useful for cost-sensitive demos.
  LEASELENS_AUTO_SCAN_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  // Sprint 44A — structured-logger level (Pino level names; 'silent' disables).
  LEASELENS_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Sprint A.8 (#8) — request guards (Michael Nygard: timeouts/bulkheads;
  // Addy Osmani: performance budgets). All default to generous values so the
  // demo/default profile is behavior-preserving — they only reject abuse.
  // Max chat message length (chars). 8000 ≈ a long paragraph of questions;
  // anything larger is almost certainly an abuse/oversize payload.
  LEASELENS_MESSAGE_MAX_CHARS: z.coerce.number().int().positive().default(8000),
  // Max request body size (bytes) accepted before parsing. 1MB matches the
  // lease-upload precedent (LEASELENS_LEASE_MAX_BYTES default).
  LEASELENS_BODY_MAX_BYTES: z.coerce.number().int().positive().default(1048576),
  // Per-call Anthropic request timeout (ms). Bounds a hung provider call so it
  // can't pin a serverless invocation until the platform timeout.
  LEASELENS_ANTHROPIC_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  // Per-tool wall-clock timeout (ms) for the async tool path (prepare +
  // read-only execute). A bulkhead so one slow tool can't stall the turn.
  LEASELENS_TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = JSON.stringify(parsedEnv.error.format(), null, 2);
  throw new Error(`Invalid environment variables:\n${formatted}`);
}

export const env = parsedEnv.data;
