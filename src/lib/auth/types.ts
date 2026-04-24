export type Role = 'Creator' | 'Editor' | 'Admin';

export interface SessionPayload {
  userId: string;
  role: Role;
  displayName: string;
}

export interface SessionClaims extends SessionPayload {
  iat?: number;
  exp?: number;
}
