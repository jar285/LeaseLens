'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { DEMO_USERS } from './constants';
import { encrypt } from './session';
import type { Role } from './types';

export async function switchRole(role: Role) {
  const targetUser = DEMO_USERS.find((u) => u.role === role);
  if (!targetUser) {
    throw new Error(`Invalid role: ${role}`);
  }

  const session = {
    userId: targetUser.id,
    role: targetUser.role,
    displayName: targetUser.display_name,
  };

  const token = await encrypt(session);

  const cookieStore = await cookies();
  cookieStore.set('leaselens_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  revalidatePath('/');
}
