import { Menu } from 'lucide-react';
import { roleColorClass, roleLabel, shortName, type UserRole } from '@/lib/roles';

// Header:
//   - Desktop (md+): name + role only. Log out lives at the bottom of the sidebar.
//   - Mobile (<md): name + role on the left, hamburger on the right (drawer trigger).
export default function Topbar({
  fullName,
  role,
  onOpenMenu,
}: {
  fullName: string;
  role: UserRole | undefined;
  onOpenMenu: () => void;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface px-3 sm:px-4">
      <div className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{shortName(fullName)}</span>
        {role && <span className={`ml-2 ${roleColorClass[role]}`}>· {roleLabel[role]}</span>}
      </div>

      <button
        type="button"
        onClick={onOpenMenu}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-muted md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    </header>
  );
}
