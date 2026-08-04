import { Bell, Building2, Menu } from 'lucide-react';
import { useState } from 'react';
import { useCompany } from '@/features/company/useCompany';
import { markNotificationRead, useNotifications } from '@/features/notifications/notifications';
import { formatDateTime } from '@/lib/format';
import { roleColorClass, roleLabel, shortName, titleCase, type UserRole } from '@/lib/roles';

// Header:
//   - Left: circular company logo (or Building2 fallback) + company name.
//   - Right (desktop): user's title-cased name + role tag.
//   - Right (mobile): hamburger — user's name is inside the drawer instead so we
//     can keep the mobile header short.
export default function Topbar({
  userId,
  fullName,
  role,
  onOpenMenu,
}: {
  userId: string | undefined;
  fullName: string;
  role: UserRole | undefined;
  onOpenMenu: () => void;
}) {
  const company = useCompany();
  const [open, setOpen] = useState(false);
  const { state, unreadCount, refresh } = useNotifications(userId);
  const notifications = state.notifications;

  async function markRead(id: string) {
    await markNotificationRead(id).catch(() => undefined);
    await refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface px-3 sm:px-4">
      {/* Left: company identity */}
      <div className="flex min-w-0 items-center gap-2.5">
        <CompanyBadge logoUrl={company?.logo_url ?? null} />
        <span className="truncate text-sm font-semibold text-ink sm:text-base">
          {titleCase(company?.name) || '—'}
        </span>
      </div>

      {/* Right: user identity (desktop) + hamburger (mobile) */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 min-w-4 rounded-full bg-role-admin px-1 text-[10px] font-semibold leading-4 text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-surface-border bg-surface shadow-xl">
              <div className="border-b border-surface-border px-4 py-3">
                <div className="text-sm font-semibold text-ink">Notifications</div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-ink-muted">No notifications yet.</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className="block w-full border-b border-surface-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-muted"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-ink">{n.title}</div>
                          {n.body && <div className="mt-1 text-xs leading-relaxed text-ink-muted">{n.body}</div>}
                          <div className="mt-1 text-[11px] text-ink-muted">{formatDateTime(n.created_at)}</div>
                        </div>
                        {!n.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-role-admin" />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="hidden text-right text-sm text-ink-muted md:block">
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
      </div>
    </header>
  );
}

function CompanyBadge({ logoUrl }: { logoUrl: string | null }) {
  // Bumped from h-8 to h-10 so the logo carries more weight in the header, matching
  // the sidebar mark and the "standard website logo" size the user asked for.
  const base = 'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full';
  if (logoUrl) {
    return (
      <div className={`${base} border border-surface-border bg-surface`}>
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${base} bg-role-admin/10 text-role-admin`}>
      <Building2 className="h-5 w-5" />
    </div>
  );
}
