import { LogOut } from 'lucide-react';
import Button from '@/components/ui/Button';
import { signOut } from '@/lib/auth';
import { roleColorClass, roleLabel, type UserRole } from '@/lib/roles';
import { sw } from '@/i18n/sw';

export default function Topbar({ fullName, role }: { fullName: string; role: UserRole | undefined }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface px-4">
      <div className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{fullName}</span>
        {role && <span className={`ml-2 ${roleColorClass[role]}`}>· {roleLabel[role]}</span>}
      </div>
      <Button variant="ghost" onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" />
        {sw.common.logout}
      </Button>
    </header>
  );
}
