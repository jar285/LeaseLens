// Sprint C.17 (#17) — composite-key quota. Generalizes the single-key demo
// rate limiter (rate-limit.ts) into N keyed rolling-window tiers checked in ONE
// transaction. Each request charges a weighted cost against every tier
// (per-session, per-IP-subnet, per-route, global-daily); if ANY tier would
// exceed its limit the request is refused and NOTHING is charged (all-or-nothing
// — no partial spend, no tier drift), reporting the limiting tier + a
// retry-after. Enforced in public-anon mode only; the demo profile keeps the
// legacy checkAndIncrementRateLimit. (GoF Strategy: per-tier policy; Google SRE:
// a global budget above the per-visitor limits.)

import type Database from 'better-sqlite3';

export interface QuotaTier {
  /** Full counter key, e.g. 'session:<uid>' | 'ip:<subnet>' | 'global:daily'. */
  key: string;
  /** Max weighted cost allowed within the window. */
  limit: number;
  /** Rolling window length in seconds. */
  windowSeconds: number;
}

export interface QuotaResult {
  allowed: boolean;
  /** The first tier that would be exceeded (null when allowed). */
  limitingKey: string | null;
  /** Seconds until the limiting tier's window frees up (0 when allowed). */
  retryAfterSeconds: number;
  /** Remaining headroom per tier after charging (or current, when blocked). */
  remainingByKey: Record<string, number>;
}

const HOUR = 3600;
const DAY = 86400;

// Policy limits (tunable; exported so tests + the quota indicator read the same
// numbers instead of hardcoding). Weighted by QUOTA_WEIGHTS at the call site, so
// a limit of 60 ≈ 60 chat turns, or 12 full scans, per hour per visitor.
export const QUOTA_LIMITS = {
  session: { limit: 60, windowSeconds: HOUR },
  ip: { limit: 300, windowSeconds: HOUR },
  route: { limit: 1000, windowSeconds: HOUR },
  global: { limit: 5000, windowSeconds: DAY },
} as const;

export interface QuotaIdentity {
  userId: string;
  subnet: string;
  route: string;
}

/** The standard 4-tier stack for a public-anon request. */
export function defaultTiers(id: QuotaIdentity): QuotaTier[] {
  return [
    { key: `session:${id.userId}`, ...QUOTA_LIMITS.session },
    { key: `ip:${id.subnet}`, ...QUOTA_LIMITS.ip },
    { key: `route:${id.route}`, ...QUOTA_LIMITS.route },
    { key: 'global:daily', ...QUOTA_LIMITS.global },
  ];
}

interface CounterRow {
  window_start: number;
  count: number;
}

/**
 * Check + charge `cost` against every tier in one transaction. All-or-nothing:
 * returns `{ allowed:false, limitingKey, retryAfterSeconds }` without charging
 * if any tier would exceed; otherwise increments every tier and returns the
 * per-tier remaining headroom.
 */
export function enforceQuota(
  db: Database.Database,
  tiers: QuotaTier[],
  cost: number,
): QuotaResult {
  const now = Math.floor(Date.now() / 1000);

  return db.transaction((): QuotaResult => {
    const remainingByKey: Record<string, number> = {};

    // Pass 1 — read current windows; find the first tier that would exceed.
    const effective = tiers.map((t) => {
      const row = db
        .prepare(
          'SELECT window_start, count FROM quota_counter WHERE quota_key = ?',
        )
        .get(t.key) as CounterRow | undefined;
      const active = row && now - row.window_start < t.windowSeconds;
      const currentCount = active ? row.count : 0;
      return {
        tier: t,
        active,
        windowStart: active ? row.window_start : now,
        currentCount,
      };
    });

    for (const e of effective) {
      if (e.currentCount + cost > e.tier.limit) {
        // Report headroom as-is (nothing charged), and how long until this
        // tier's window frees. A still-active window frees at its end; an
        // already-fresh window that still can't fit `cost` needs a full window.
        for (const x of effective) {
          remainingByKey[x.tier.key] = Math.max(
            0,
            x.tier.limit - x.currentCount,
          );
        }
        const retryAfterSeconds = e.active
          ? Math.max(1, e.windowStart + e.tier.windowSeconds - now)
          : e.tier.windowSeconds;
        return {
          allowed: false,
          limitingKey: e.tier.key,
          retryAfterSeconds,
          remainingByKey,
        };
      }
    }

    // Pass 2 — all tiers fit; charge every one.
    for (const e of effective) {
      if (e.active) {
        db.prepare(
          'UPDATE quota_counter SET count = count + ? WHERE quota_key = ?',
        ).run(cost, e.tier.key);
      } else {
        db.prepare(
          'INSERT OR REPLACE INTO quota_counter (quota_key, window_start, count) VALUES (?, ?, ?)',
        ).run(e.tier.key, now, cost);
      }
      remainingByKey[e.tier.key] = Math.max(
        0,
        e.tier.limit - (e.currentCount + cost),
      );
    }

    return {
      allowed: true,
      limitingKey: null,
      retryAfterSeconds: 0,
      remainingByKey,
    };
  })();
}
