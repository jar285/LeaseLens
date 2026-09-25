/**
 * A single versioned schema migration.
 *
 * - `version`: monotonically increasing integer; gaps are fine, duplicates
 *   are not.
 * - `name`: short snake_case description, e.g. 'initial_schema'.
 * - `up`: SQLite-dialect DDL/DML. Runs inside a transaction. The same file
 *   must apply to local `file:` dev DBs and the hosted Turso database, so
 *   keep it to the SQLite dialect (no Postgres-isms).
 */
export interface Migration {
  version: number;
  name: string;
  up: string;
}
