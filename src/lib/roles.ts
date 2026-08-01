export type UserRole = 'owner' | 'accountant' | 'worker';

// English-first labels. Owner surfaces as "Admin" in the UI — that's what non-technical
// users expect (per user feedback). Change here to relabel across the whole app.
export const roleLabel: Record<UserRole, string> = {
  owner: 'Admin',
  accountant: 'Accountant',
  worker: 'Staff',
};

export const roleColorClass: Record<UserRole, string> = {
  owner: 'text-role-admin',
  accountant: 'text-role-accountant',
  worker: 'text-role-worker',
};

export const roleBgClass: Record<UserRole, string> = {
  owner: 'bg-role-admin',
  accountant: 'bg-role-accountant',
  worker: 'bg-role-worker',
};

export function hasAnyRole(role: UserRole | undefined, allowed: readonly UserRole[]): boolean {
  return role !== undefined && allowed.includes(role);
}

// Trim a full name down to the first two words. "Reagan Fraizer Fraizer Kavishe" → "Reagan Fraizer".
// Keeps the header compact on mobile without losing recognizability.
export function shortName(full: string | null | undefined, words = 2): string {
  if (!full) return '—';
  const parts = full.trim().split(/\s+/);
  return parts.slice(0, words).join(' ') || full;
}
