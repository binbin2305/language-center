import { can, Role } from '@lc/shared';

interface Actor { id: string; role: Role }

/**
 * Whether `me` may lock/unlock/reset the password of `target`.
 * Mirrors the server guard in UsersService: nobody acts on themselves, and a MANAGER
 * cannot act on an ADMIN account. Keep in sync with the API rule.
 */
export function canActOnUser(me: Actor | null, target: Actor): boolean {
  if (!me || !can(me, 'users.manage')) return false;
  if (me.id === target.id) return false;
  return !(me.role === Role.MANAGER && target.role === Role.ADMIN);
}
