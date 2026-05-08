// Sprint 15.2 — shared helper that re-inserts the three demo users into
// the dev DB if they're missing. Idempotent (uses INSERT OR IGNORE), so
// it's cheap to call on every render of a server component that depends
// on a particular demo user existing — typically the home page, which
// reads the session cookie's userId and validates it against the users
// table before trusting the role.
//
// Lifted from src/app/api/chat/route.ts (Sprint 13). The chat route
// keeps a defensive call before persisting messages; the home page now
// also calls it before checking userExists, so a wiped dev DB no longer
// silently demotes the role-switcher back to Creator.

import type Database from 'better-sqlite3';
import { DEMO_USERS } from './constants';

export function ensureDemoUsersExist(db: Database.Database): void {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const now = Math.floor(Date.now() / 1000);
  for (const user of DEMO_USERS) {
    insertUser.run(user.id, user.email, user.role, user.display_name, now);
  }
}
