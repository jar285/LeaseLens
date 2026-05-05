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

export interface WorkspaceCookiePayload {
  workspace_id: string;
}
