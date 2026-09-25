import { db } from '@/lib/db';

const WINDOW_SECONDS = 3600;
const MAX_REQUESTS = 10;

export async function checkAndIncrementRateLimit(sessionId: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  const now = Math.floor(Date.now() / 1000);

  return db.transaction(async (tx) => {
    const row = await tx
      .prepare(
        'SELECT window_start, count FROM rate_limit WHERE session_id = ?',
      )
      .get<{ window_start: number; count: number }>(sessionId);

    if (!row || now - row.window_start >= WINDOW_SECONDS) {
      await tx
        .prepare(
          'INSERT OR REPLACE INTO rate_limit (session_id, window_start, count) VALUES (?, ?, 1)',
        )
        .run(sessionId, now);
      return { allowed: true, remaining: MAX_REQUESTS - 1 };
    }

    if (row.count >= MAX_REQUESTS) {
      return { allowed: false, remaining: 0 };
    }

    const newCount = row.count + 1;
    await tx
      .prepare('UPDATE rate_limit SET count = ? WHERE session_id = ?')
      .run(newCount, sessionId);
    return { allowed: true, remaining: MAX_REQUESTS - newCount };
  });
}
