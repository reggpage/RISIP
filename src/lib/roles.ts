export type UserRole = 'owner' | 'accountant' | 'worker';

export const roleLabel: Record<UserRole, string> = {
  owner: 'Msimamizi',
  accountant: 'Mhasibu',
  worker: 'Mfanyakazi',
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
