import { z } from 'zod';

const envSchema = z.object({
  CONTENTOPS_DB_PATH: z.string().default('./data/contentops.db'),
  CONTENTOPS_DEMO_MODE: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  CONTENTOPS_ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5'),
  CONTENTOPS_DAILY_SPEND_CEILING_USD: z.coerce.number().default(2),
  // Sprint 2 does not use live Anthropic calls; tighten this in Sprint 3.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CONTENTOPS_SESSION_SECRET: z
    .string()
    .min(32, 'CONTENTOPS_SESSION_SECRET must be at least 32 characters'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = JSON.stringify(parsedEnv.error.format(), null, 2);
  throw new Error(`Invalid environment variables:\n${formatted}`);
}

export const env = parsedEnv.data;
