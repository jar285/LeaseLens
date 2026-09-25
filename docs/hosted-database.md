# Hosted database (issue #29)

LeaseLens runs on SQLite dialect via `@libsql/client`, against one of two
backends selected by environment:

| Environment | Backend | Config |
|---|---|---|
| Local dev / tests | SQLite file (or `:memory:`) | `LEASELENS_DB_PATH` (default `./data/leaselens.db`) |
| Production (Vercel) | Hosted Turso (libSQL) | `LEASELENS_TURSO_URL` + `LEASELENS_TURSO_AUTH_TOKEN` |

## Why Turso

- **Same dialect.** Turso is libSQL — SQLite under the hood. The schema,
  migrations, and every query are unchanged SQLite; no `?` → `$1`
  placeholder rewrites, no type-mapping surprises. (A Postgres move would
  have meant rewriting all 100+ queries _and_ the migration history.)
- **Serverless-fit.** Turso speaks HTTP; no persistent TCP connections, so it
  works from Vercel functions without a connection pooler. (`@libsql/client`
  opens no sockets for `file:`/`libsql://` — the remote is plain HTTPS.)
- **Free tier covers launch.** The free tier (500 databases, generous row
  reads/writes) is more than enough for a public-anon launch with per-visitor
  quotas.
- **Automatic snapshots** (retention varies by plan; point-in-time recovery
  is a paid-plan feature — see below).

## Provisioning (Jesus's steps)

1. Install the Turso CLI and sign up: https://docs.turso.tech/quickstart
   (`brew install tursodatabase/tap/turso`, `turso auth signup`).
2. Create the database (pick the region closest to the Vercel deployment):
   ```
   turso db create leaselens-prod --location iad
   ```
3. Get the URL and a token:
   ```
   turso db show leaselens-prod --url
   turso db tokens create leaselens-prod
   ```
4. In the Vercel project → Settings → Environment Variables, add:
   - `LEASELENS_TURSO_URL=libsql://…` (the URL from step 3)
   - `LEASELENS_TURSO_AUTH_TOKEN=…` (the token from step 3)
   - Set both for **Production** (and Preview if you want preview deploys
     against the same DB — usually better to create a second `leaselens-preview`
     database for previews).
5. Also set `LEASELENS_PUBLIC_ANON_MODE=true` for the public deploy (it
   **fails closed at boot** without `LEASELENS_TURSO_URL` — that's intentional).
6. Deploy. Migrations run automatically on first query (`schema_migrations`
   table); the NJ corpus seed runs via the existing `prebuild` hook
   (`npm run db:seed` targets the Turso DB when the env vars are set).

## Schema changes

Versioned migrations live in `src/lib/db/migrations/` and are registered in
`src/lib/db/migrations/index.ts`. To add one:

1. Create `src/lib/db/migrations/NNNN_description.ts` exporting
   `{ version, name, up }` (`up` = SQLite-dialect SQL, runs in a transaction).
2. Register it in the `MIGRATIONS` array.
3. Add a test in `src/lib/db/migrations.test.ts`.

Migrations apply on first DB use (lazy init in `src/lib/db/index.ts`) —
there is no separate migrate command to remember in deploy pipelines.

## Backup story

- **Turso** takes automatic snapshots; point-in-time recovery is a paid-plan
  feature, and snapshot retention varies by plan — confirm in the Turso
  dashboard after provisioning. For a belt-and-braces
  copy, `turso db shell leaselens-prod ".dump" > backup.sql` produces a
  portable SQL dump any SQLite can restore.
- **Local dev** databases are disposable: delete `data/leaselens.db` and
  re-run `npm run dev` (the `predev` hook re-seeds the corpus).

## Moving existing SQLite data to Turso

No production data exists yet (pre-launch), but for a dev database with data
worth keeping:

```
# 1. Make sure the Turso DB exists and env vars point at it (see above).
# 2. Copy every table's rows from the local file into Turso:
node scripts/copy-sqlite-to-turso.mjs ./data/leaselens.db
```

The script reads each table from the local file and inserts the rows into the
already-migrated Turso database in batches (only columns present in both are
copied, so an older dev schema still transfers). It never touches schema —
run the app once first so migrations have applied.

## Connection pooling

Not applicable in the traditional sense: `@libsql/client` talks to Turso over
stateless HTTPS, so there is no connection pool to exhaust on serverless.
Local `file:` mode uses a single embedded connection, serialized like the old
better-sqlite3 path.

## Local Turso for testing (optional)

To test the remote code path without touching production:

```
turso dev --db-file /tmp/leaselens-local.db   # serves libsql:// on :8080
LEASELENS_TURSO_URL=http://127.0.0.1:8080 npm run dev
```

## Design notes

Named principles are used here only where they changed a concrete decision
(see `docs/_architecture/power-words.md` — the local contract):

- **GoF Adapter + Facade.** `src/lib/db/client.ts` is an Adapter: it wraps
  `@libsql/client`'s async API in the project's statement-shaped `Db`
  interface (`prepare().get()/all()/run()`, `exec()`, `transaction()`), so
  the conversion is mechanical (`await` + `async`) and no query text changed.
  `src/lib/db/index.ts` is a Facade over client creation, local PRAGMAs, and
  migrations — callers keep importing `db` from `@/lib/db`.
- **Robert C. Martin (DIP).** Domain code depends on the `Db` abstraction,
  never on `@libsql/client` directly — the driver is imported only in
  `client.ts`, the `index.ts` composition root, and standalone scripts. The
  storage/provider boundary the architecture doc requires is preserved.
- **Martin Kleppmann.** Versioned migrations with baseline-marking (existing
  DBs keep their data), transactional migration application, explicit
  commit/rollback with rollback-failure isolation, and the FK-enforcement
  limitation below are all data-system failure-mode decisions.
- **Mitchell Hashimoto.** Backend selection is explicit env config
  (`LEASELENS_TURSO_URL` / `LEASELENS_TURSO_AUTH_TOKEN` / `LEASELENS_DB_PATH`),
  documented in `.env.example`; public-anon mode fails closed without a
  hosted URL. No hidden local-path assumptions.
- **Guillermo Rauch / Vercel.** The old boot path assumed a writable local
  file (mkdir, WAL); the new path assumes nothing about the filesystem, so
  the app fits serverless deployment.

## Known limitations

- **Foreign-key enforcement on remote Turso is not verifiable from here.**
  Empirically confirmed: local libSQL (`:memory:` and `file:`) enforces FKs
  by default — no PRAGMA needed. Over the remote HTTP client each operation
  runs on its own Hrana stream and `PRAGMA foreign_keys` is per-connection,
  so a client-side pragma cannot guarantee enforcement; it depends on the
  Turso server default, which must be checked after provisioning:
  `turso db shell leaselens-prod "PRAGMA foreign_keys;"` should return `1`.
  What holds regardless: the schema declares the FKs (Sprint D.20 net, pinned
  by `schema.test.ts`); the purge cascade is explicit children-first and does
  not depend on `ON DELETE CASCADE` (none declared); `scripts/diag-db.mjs`
  orphan probes detect drift.
- **No connection pooling in the traditional sense** (stateless HTTPS), so
  there is nothing to tune — but also no server-side session state to rely on.
- **Concurrent cold starts** racing migrations on a fresh database: DDL is
  `IF NOT EXISTS` and each migration applies in a transaction; a loser of the
  race fails its transaction and succeeds on retry once the winner's
  `schema_migrations` row is visible.
