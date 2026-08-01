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

// Trim a full name down to the first N words AND title-case each one.
// "REAGAN FRAIZER FRAIZER KAVISHE" → "Reagan Fraizer".
// People often type their names in ALL CAPS when signing up; the header shouldn't
// scream it back at them.
export function shortName(full: string | null | undefined, words = 2): string {
  if (!full) return '—';
  const parts = full.trim().split(/\s+/).slice(0, words);
  const titled = parts.map((w) =>
    w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase(),
  );
  return titled.join(' ') || full;
}

// Title-case an arbitrary string (used for company names entered in ALL CAPS).
export function titleCase(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}
