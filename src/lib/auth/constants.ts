import type { Role } from './types';

export interface DemoUser {
  id: string;
  email: string;
  role: Role;
  display_name: string;
}

/**
 * Stable demo user definitions. Intentionally no Node.js imports —
 * this file must remain safe for the Edge Runtime (middleware).
 *
 * S19.1 — `role` is the application-side Role
 * (Tenant/Reviewer/Admin). DB writes translate to the wire literals
 * via role-codec.toDbRole() at the seed boundary.
 */
export const DEMO_USERS: DemoUser[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'creator@contentops.local',
    role: 'Tenant',
    display_name: 'Syndicate Tenant',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'editor@contentops.local',
    role: 'Reviewer',
    display_name: 'Syndicate Reviewer',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'admin@contentops.local',
    role: 'Admin',
    display_name: 'Syndicate Admin',
  },
];
