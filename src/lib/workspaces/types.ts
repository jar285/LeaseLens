export interface Workspace {
  id: string;
  name: string;
  description: string;
  /** SQLite stores boolean as integer (0/1). */
  is_sample: 0 | 1;
  created_at: number;
  /** Unix seconds. NULL for sample workspace (never expires). */
  expires_at: number | null;
}

/**
 * `workspace_id` is the active workspace; `created_workspace_ids` is the
 * visitor's history of brands they uploaded in this browser. The list is
 * the basis of the WorkspaceMenu's switch-back-to-a-prior-brand UX —
 * privacy is per-cookie (each visitor only sees their own uploads).
 *
 * Cookies signed before this list field existed decode with an empty list.
 */
export interface WorkspaceCookiePayload {
  workspace_id: string;
  created_workspace_ids: string[];
}
