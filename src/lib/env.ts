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
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = JSON.stringify(parsedEnv.error.format(), null, 2);
  throw new Error(`Invalid environment variables:\n${formatted}`);
}

export const env = parsedEnv.data;
