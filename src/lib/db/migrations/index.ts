import { migration0001 } from './0001_initial_schema';
import type { Migration } from './types';

/**
 * The ordered migration list. Add new migrations here (and only here) —
 * `runMigrations` applies them in array order, skipping recorded versions.
 */
export const MIGRATIONS: Migration[] = [migration0001];
