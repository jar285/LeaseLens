// Sprint B.14 (#14) — Edge-safe public-anon mode flag.
//
// Middleware runs on the Edge runtime, which CANNOT import env.ts (its Zod
// parse throws at module load) or auth/mode.ts (which imports env). This reads
// process.env raw, mirroring the Zod transform in env.ts, so the Edge path
// stays env-free. Node call sites should use auth/mode.ts (validated env)
// instead — this module exists solely for the Edge boundary.

export function isPublicAnonModeFromProcessEnv(): boolean {
  const v = process.env.LEASELENS_PUBLIC_ANON_MODE;
  return v === 'true' || v === '1';
}
